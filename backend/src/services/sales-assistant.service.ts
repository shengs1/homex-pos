import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import OpenAI from "openai";

export interface SalesAssistantPayload {
  need?: string;
  budgetMin?: number;
  budgetMax?: number;
  customerId?: number;
  cartItems?: Array<{
    productId: number;
    name: string;
    quantity: number;
  }>;
  preferences?: {
    preferPromotion?: boolean;
    preferWarranty?: boolean;
    preferHighStock?: boolean;
    crossSellFromCart?: boolean;
  };
}

export type SalesAssistantRecommendation = {
  productId: number;
  name: string;
  price: number;
  stockQuantity: number;
  imageUrl?: string;
  reason: string;
  type: "NEED_MATCH" | "CROSS_SELL" | "BUDGET_MATCH" | "PROMOTION";
  confidence?: number;
};

export type SalesAssistantResponse = {
  summary: string;
  recommendations: SalesAssistantRecommendation[];
  bundleSuggestion?: string;
  cashierTips?: string[];
  source?: "AI" | "HEURISTIC";
};

function safeParseAiJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

export const salesAssistantService = {
  async getSuggestions(payload: SalesAssistantPayload): Promise<SalesAssistantResponse> {
    const budgetMin = payload.budgetMin !== undefined ? Number(payload.budgetMin) : undefined;
    const budgetMax = payload.budgetMax !== undefined ? Number(payload.budgetMax) : undefined;

    // 1. Fetch active products in stock
    const products = await prisma.product.findMany({
      where: {
        status: "ACTIVE",
        stockQuantity: {
          gt: 0,
        },
      },
      include: {
        category: true,
      },
    });

    // 2. Filter candidates based on budget
    let candidates = products;
    if (budgetMin !== undefined) {
      candidates = candidates.filter(p => Number(p.salePrice) >= budgetMin);
    }
    if (budgetMax !== undefined) {
      candidates = candidates.filter(p => Number(p.salePrice) <= budgetMax);
    }

    // Extract categoryIds from cart items
    const cartProductIds = payload.cartItems?.map(item => item.productId) || [];
    const cartProducts = products.filter(p => cartProductIds.includes(p.id));
    const cartCategoryIds = cartProducts.map(p => p.categoryId);

    // 3. Pre-score candidates to find top 25
    const scoredCandidates = candidates.map(p => {
      let score = 0;

      // Promotion
      const hasPromo = p.originalPrice && Number(p.originalPrice) > Number(p.salePrice);
      if (hasPromo) {
        score += payload.preferences?.preferPromotion ? 25 : 10;
      }

      // Warranty
      if (p.warrantyMonths > 0) {
        score += payload.preferences?.preferWarranty ? 20 : 5;
      }

      // High Stock
      if (p.stockQuantity > 10) {
        score += payload.preferences?.preferHighStock ? 15 : 5;
      }

      // Cross-sell same category
      const isSameCategory = cartCategoryIds.includes(p.categoryId);
      if (isSameCategory) {
        score += payload.preferences?.crossSellFromCart ? 30 : 10;
      }

      // Keyword matching from need
      if (payload.need) {
        const needLower = payload.need.toLowerCase();
        if (p.name.toLowerCase().includes(needLower) || p.category.name.toLowerCase().includes(needLower)) {
          score += 50;
        } else {
          const keywords = needLower.split(/[\s,]+/);
          let keywordMatches = 0;
          for (const kw of keywords) {
            if (kw.length > 2 && (p.name.toLowerCase().includes(kw) || p.category.name.toLowerCase().includes(kw))) {
              keywordMatches++;
            }
          }
          score += keywordMatches * 10;
        }
      }

      return { product: p, score };
    });

    // Sort candidates
    const sortedCandidates = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .map(x => x.product);

    const candidatesToSend = sortedCandidates.slice(0, 25);

    // 4. Try AI generation if GITHUB_TOKEN is configured
    if (process.env.GITHUB_TOKEN) {
      try {
        const openai = new OpenAI({
          baseURL: "https://models.inference.ai.azure.com",
          apiKey: process.env.GITHUB_TOKEN,
        });

        const systemPrompt = "Bạn là trợ lý gợi ý bán hàng cho hệ thống POS đồ gia dụng Homex. BẮT BUỘC chỉ chọn sản phẩm có trong candidateProducts. Không được bịa sản phẩm, không được tự tạo giảm giá, không được gợi ý sản phẩm hết hàng hoặc inactive. Chỉ trả về JSON thuần, không markdown, không giải thích ngoài JSON.";
        const userPayload = {
          customerNeed: payload.need || "",
          budgetMin: budgetMin || 0,
          budgetMax: budgetMax || 999999999,
          cartItems: payload.cartItems || [],
          preferences: payload.preferences || {},
          candidateProducts: candidatesToSend.map((p) => ({
            productId: p.id,
            name: p.name,
            categoryName: p.category?.name,
            price: Number(p.salePrice),
            originalPrice: p.originalPrice ? Number(p.originalPrice) : null,
            stockQuantity: p.stockQuantity,
            warrantyMonths: p.warrantyMonths,
            description: p.description || "",
            promotionInfo: (p.originalPrice && Number(p.originalPrice) > Number(p.salePrice)) 
              ? `Giảm giá từ ${Number(p.originalPrice)} còn ${Number(p.salePrice)}`
              : null
          })),
          requiredJsonShape: {
            summary: "string",
            recommendations: [
              {
                productId: "number",
                reason: "string",
                type: "NEED_MATCH | CROSS_SELL | BUDGET_MATCH | PROMOTION",
                confidence: "number from 0 to 1"
              }
            ],
            bundleSuggestion: "string",
            cashierTips: ["string"]
          }
        };

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) }
          ]
        });

        const rawJson = response.choices[0]?.message?.content || "{}";
        const aiResponse = safeParseAiJson(rawJson);

        if (aiResponse && Array.isArray(aiResponse.recommendations)) {
          const validatedRecs: SalesAssistantRecommendation[] = [];
          for (const rec of aiResponse.recommendations) {
            const product = candidatesToSend.find(p => p.id === Number(rec.productId));
            if (product) {
              validatedRecs.push({
                productId: product.id,
                name: product.name,
                price: Number(product.salePrice),
                stockQuantity: product.stockQuantity,
                imageUrl: product.imageUrl || "",
                reason: rec.reason || "Sản phẩm phù hợp với nhu cầu khách hàng.",
                type: rec.type || "NEED_MATCH",
                confidence: Number(rec.confidence || 0.8)
              });
            }
          }

          if (validatedRecs.length > 0) {
            return {
              summary: aiResponse.summary || "Đã phân tích và tìm thấy sản phẩm phù hợp.",
              recommendations: validatedRecs.slice(0, 5),
              bundleSuggestion: aiResponse.bundleSuggestion || "",
              cashierTips: aiResponse.cashierTips || [],
              source: "AI"
            };
          }
        }
      } catch (aiError) {
        console.error("AI service error, falling back to heuristic scoring:", aiError);
      }
    }

    // 5. Fallback Heuristic scoring
    const recommendations: SalesAssistantRecommendation[] = sortedCandidates.slice(0, 5).map((p) => {
      let reason = "Sản phẩm phù hợp với ngân sách và còn hàng trong kho.";
      let type: "NEED_MATCH" | "CROSS_SELL" | "BUDGET_MATCH" | "PROMOTION" = "NEED_MATCH";

      const hasPromo = p.originalPrice && Number(p.originalPrice) > Number(p.salePrice);
      const isSameCategory = cartCategoryIds.includes(p.categoryId);

      if (hasPromo) {
        reason = "Sản phẩm đang có ưu đãi giảm giá tốt.";
        type = "PROMOTION";
      } else if (isSameCategory) {
        reason = "Sản phẩm thuộc cùng nhóm sản phẩm đang chọn, thích hợp mua kèm.";
        type = "CROSS_SELL";
      } else if (budgetMax && Number(p.salePrice) <= budgetMax) {
        reason = "Sản phẩm giá tốt nằm trong khoảng ngân sách yêu cầu.";
        type = "BUDGET_MATCH";
      }

      return {
        productId: p.id,
        name: p.name,
        price: Number(p.salePrice),
        stockQuantity: p.stockQuantity,
        imageUrl: p.imageUrl || "",
        reason,
        type,
        confidence: 0.85
      };
    });

    const summary = payload.need
      ? `Đang dùng gợi ý nhanh từ dữ liệu sản phẩm hiện có cho: "${payload.need}"`
      : "Gợi ý nhanh các sản phẩm đang có sẵn.";

    const bundleSuggestion = recommendations.length >= 2
      ? recommendations.slice(0, 3).map(r => r.name).join(" + ")
      : "Không có gợi ý combo.";

    const cashierTips = [
      "Nhắc khách sản phẩm có chế độ bảo hành đầy đủ.",
      "Tư vấn về các tính năng vượt trội của sản phẩm đang được gợi ý."
    ];

    return {
      summary,
      recommendations,
      bundleSuggestion,
      cashierTips,
      source: "HEURISTIC"
    };
  }
};
