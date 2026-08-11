import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { createAiClient, getConfiguredAiProviders } from "./ai-provider.service";

export interface SalesAssistantPayload {
  language?: "vi" | "en";
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
  provider?: "Gemini" | "Groq";
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

function normalizeText(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

const CORE_TERM_MAP: Record<string, string[]> = {
  // Nồi cơm & thiết bị nấu
  "noi com dien": ["noi com dien", "noi com", "rice cooker", "rice multicooker", "grain cooker", "rice", "cooker", "multicooker"],
  "noi com": ["noi com dien", "noi com", "rice cooker", "rice multicooker", "grain cooker", "rice", "cooker", "multicooker"],

  // Máy xay & chế biến thực phẩm
  "may xay": ["may xay", "xay", "blender", "juicer", "mixer", "processor"],
  "may xay sinh to": ["may xay sinh to", "may xay", "sinh to", "blender", "juicer", "mixer"],
  "may ep": ["may ep", "juicer", "blender"],

  // Ấm đun & thiết bị đun nước
  "am dun": ["am dun", "am sieu toc", "kettle", "water heater", "tea kettle"],
  "am sieu toc": ["am dun", "am sieu toc", "kettle", "water heater", "tea kettle"],

  // Thiết bị làm sạch: Máy hút bụi & cây lau nhà
  "may hut bui": ["may hut bui", "hut bui", "vacuum", "roborock", "sweeper", "bissell"],
  "robot hut bui": ["robot hut bui", "may hut bui", "roborock", "vacuum"],
  "cay lau nha": ["cay lau nha", "lau nha", "choi lau", "mop", "steam mop", "floor mop"],
  "don dep nha cua": ["don dep", "lau nha", "hut bui", "mop", "vacuum", "cleaner", "steamer", "sweeper"],
  "don dep": ["don dep", "lau nha", "hut bui", "mop", "vacuum", "cleaner"],

  // Tủ lạnh & thiết bị làm lạnh
  "tu lanh": ["tu lanh", "tu mat", "refrigerator", "fridge", "freezer", "chiller"],
  "tu mat": ["tu lanh", "tu mat", "refrigerator", "fridge", "freezer", "chiller"],

  // Làm mát & Lọc không khí
  "loc khong khi": ["loc khong khi", "may loc khong khi", "air purifier", "purifier", "filter", "bionaire", "healthmate", "medify"],
  "may loc khong khi": ["loc khong khi", "may loc khong khi", "air purifier", "purifier", "filter", "bionaire", "healthmate", "medify"],
  "dieu hoa": ["dieu hoa", "lam mat", "air purifier", "cool", "fan"],
  "tiet kiem dien": ["tiet kiem dien", "energy saving", "led", "bulb", "refrigerator", "purifier", "cooker"],

  // Ổ cắm & Thiết bị điện
  "o dien": ["o dien", "o cam", "day dien", "outlet", "power strip", "surge protector", "extension cord", "plug"],
  "o cam": ["o dien", "o cam", "day dien", "outlet", "power strip", "surge protector", "extension cord", "plug"],
  "day dien": ["day dien", "extension cord", "cord", "power strip"],
  "bong den": ["bong den", "den led", "bulb", "lamp", "led"],

  // Đồ phòng tắm
  "do phong tam": ["phong tam", "tham", "ke", "bath", "bath mat", "shower", "caddy"],
  "phong tam": ["phong tam", "tham", "ke", "bath", "bath mat", "shower", "caddy"],
  "tham nha tam": ["tham", "bath mat", "mat"],
  "tham": ["tham", "bath mat", "mat"],

  // Dụng cụ nấu ăn & Xoong nồi
  "do nha bep": ["kitchen", "cookware", "kettle", "cooker", "pot", "pan", "refrigerator", "steamer", "multicooker"],
  "dung cu nau an": ["cookware", "steamer", "pot", "pan", "kitchen", "sauce pot"],
  "xoong noi": ["cookware", "pot", "pan", "sauce pot", "steamer"],
  "chao": ["pan", "cookware", "skillet"],
  "noi hap": ["steamer", "cookware", "pot"],

  // Hộp đựng & Đồ dùng gia đình
  "hop dung": ["hop dung", "storage box", "storage bin", "storage container", "box", "bin", "latch"],
  "do dung gia dinh": ["storage", "box", "bin", "container", "utility", "do dung"],

  // Quà tân gia
  "qua tan gia": ["cookware", "air purifier", "refrigerator", "rice cooker", "kettle", "steamer", "set"],
};

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesWordOrPhrase(text: string, pattern: string): boolean {
  const normText = normalizeText(text);
  const normPattern = normalizeText(pattern);
  if (!normText || !normPattern) return false;

  // So khớp theo cả từ/cụm từ để "noi" không bị nhận nhầm khi nằm trong từ "noise".
  const regex = new RegExp(`(?:^|\\s|[^a-z0-9])${escapeRegExp(normPattern)}(?:$|\\s|[^a-z0-9])`, "i");
  return regex.test(normText);
}

const ACCESSORY_WORDS = [
  "bulb", "light bulb", "lamp", "den led", "bong den", "phu kien", "linh kien", "replacement", "filter", "mang loc", "pad"
];

function isAccessoryProduct(name: string): boolean {
  const norm = normalizeText(name);
  return ACCESSORY_WORDS.some(w => matchesWordOrPhrase(norm, w));
}

function isAccessorySearch(need: string): boolean {
  const norm = normalizeText(need);
  return ACCESSORY_WORDS.some(w => matchesWordOrPhrase(norm, w));
}

function calculateRelevance(
  p: { name: string; category?: { name: string } | null; description?: string | null },
  need: string
): number {
  if (!need || !need.trim()) return 0;

  const normNeed = normalizeText(need);
  const fullText = `${p.name} ${p.category ? p.category.name : ""} ${p.description || ""}`;

  // Tìm các từ khóa chính đã được khai báo sẵn trong bảng ánh xạ.
  let coreTerms: string[] = [];
  for (const [key, terms] of Object.entries(CORE_TERM_MAP)) {
    if (matchesWordOrPhrase(normNeed, key)) {
      coreTerms.push(...terms);
    }
  }

  // Nếu chưa có từ khóa phù hợp, tách từ trong nhu cầu và bỏ các từ quá chung chung.
  if (coreTerms.length === 0) {
    const genericWords = new Set([
      "dien", "cho", "gia", "dinh", "nguoi", "loai", "can", "mua", "tim", "san", "pham", "do", "va", "tot", "re", "cao"
    ]);
    const tokens = normNeed.split(/[\s,.\-\/]+/).filter(t => t.length >= 2 && !genericWords.has(t));
    coreTerms = tokens;
  }

  // Sản phẩm phải khớp ít nhất một từ khóa chính thì mới được xem là liên quan.
  if (coreTerms.length > 0) {
    const hasCoreMatch = coreTerms.some(term => matchesWordOrPhrase(fullText, term));
    if (!hasCoreMatch) {
      return 0; // Không liên quan đến nhu cầu của khách hàng.
    }
  }

  let score = 0;

  // 1. Cộng điểm khi tên, danh mục hoặc mô tả khớp trực tiếp với nhu cầu.
  if (matchesWordOrPhrase(p.name, normNeed)) score += 100;
  if (p.category && matchesWordOrPhrase(p.category.name, normNeed)) score += 60;
  if (p.description && matchesWordOrPhrase(p.description, normNeed)) score += 40;

  // 2. Cộng điểm theo vị trí xuất hiện của từng từ khóa chính.
  for (const term of coreTerms) {
    if (matchesWordOrPhrase(p.name, term)) {
      score += 35;
    } else if (p.category && matchesWordOrPhrase(p.category.name, term)) {
      score += 20;
    } else if (p.description && matchesWordOrPhrase(p.description, term)) {
      score += 15;
    }
  }

  // 3. Trừ điểm phụ kiện nếu khách đang tìm thiết bị chính, tránh gợi ý sai loại.
  if (isAccessoryProduct(p.name) && !isAccessorySearch(need)) {
    score -= 300;
  }

  return score;
}

export const salesAssistantService = {
  async getSuggestions(payload: SalesAssistantPayload): Promise<SalesAssistantResponse> {
    const isEnglish = payload.language === "en";
    const budgetMin = payload.budgetMin !== undefined ? Number(payload.budgetMin) : undefined;
    const budgetMax = payload.budgetMax !== undefined ? Number(payload.budgetMax) : undefined;

    // 1. Lấy các sản phẩm đang hoạt động và vẫn còn hàng trong kho.
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

    // 2. Lọc sản phẩm theo khoảng ngân sách khách hàng đã chọn.
    let candidates = products;
    if (budgetMin !== undefined) {
      candidates = candidates.filter(p => Number(p.salePrice) >= budgetMin);
    }
    if (budgetMax !== undefined) {
      candidates = candidates.filter(p => Number(p.salePrice) <= budgetMax);
    }

    // Lấy danh mục của các sản phẩm trong giỏ để hỗ trợ gợi ý mua kèm.
    const cartProductIds = payload.cartItems?.map(item => item.productId) || [];
    const cartProducts = products.filter(p => cartProductIds.includes(p.id));
    const cartCategoryIds = cartProducts.map(p => p.categoryId);

    const isNeedSpecified = Boolean(payload.need && payload.need.trim().length > 0);

    // 3. Chấm điểm sơ bộ cho từng sản phẩm trước khi gửi sang AI.
    const scoredCandidates = candidates.map(p => {
      let score = 0;
      const relevance = isNeedSpecified ? calculateRelevance(p, payload.need!) : 0;

      if (isNeedSpecified) {
        if (relevance > 0) {
          score += 1000 + relevance;
        }
      }

      // Cộng điểm nếu sản phẩm đang có khuyến mãi.
      const hasPromo = p.originalPrice && Number(p.originalPrice) > Number(p.salePrice);
      if (hasPromo) {
        score += payload.preferences?.preferPromotion ? 25 : 10;
      }

      // Cộng điểm nếu sản phẩm có bảo hành.
      if (p.warrantyMonths > 0) {
        score += payload.preferences?.preferWarranty ? 20 : 5;
      }

      // Cộng điểm nếu sản phẩm còn nhiều trong kho.
      if (p.stockQuantity > 10) {
        score += payload.preferences?.preferHighStock ? 15 : 5;
      }

      // Cộng điểm cho sản phẩm cùng nhóm với hàng trong giỏ để gợi ý mua kèm.
      const isSameCategory = cartCategoryIds.includes(p.categoryId);
      if (isSameCategory) {
        score += payload.preferences?.crossSellFromCart ? 30 : 10;
      }

      return { product: p, score, relevance };
    });

    // Sắp xếp sản phẩm từ điểm cao xuống điểm thấp.
    const sortedScored = scoredCandidates.sort((a, b) => b.score - a.score);

    // Khi khách có nhập nhu cầu, chỉ ưu tiên những sản phẩm thật sự liên quan.
    let candidatesToSend: typeof products = [];
    if (isNeedSpecified) {
      const relevantOnly = sortedScored.filter(x => x.relevance > 0).map(x => x.product);
      if (relevantOnly.length > 0) {
        candidatesToSend = relevantOnly.slice(0, 25);
      } else {
        // Nếu chưa khớp từ khóa trực tiếp, vẫn giữ các sản phẩm điểm cao để AI kiểm tra thêm.
        candidatesToSend = sortedScored.map(x => x.product).slice(0, 25);
      }
    } else {
      candidatesToSend = sortedScored.map(x => x.product).slice(0, 25);
    }

    // 4. Lập danh sách dịch vụ AI theo thứ tự: Gemini rồi Groq.
    // Nếu dịch vụ trước bị lỗi hoặc quá thời gian chờ, hệ thống tự thử dịch vụ tiếp theo.
    const aiProviders = getConfiguredAiProviders();

    for (const provider of aiProviders) {
      try {
        const openai = createAiClient(provider);

        const systemPrompt =
          "Bạn là trợ lý gợi ý bán hàng cho hệ thống POS đồ gia dụng Homex. BẮT BUỘC chỉ chọn sản phẩm thực sự phù hợp hoặc liên quan tới nhu cầu khách hàng (customerNeed) từ candidateProducts. KHÔNG được bịa sản phẩm, KHÔNG được gợi ý sản phẩm hoàn toàn không liên quan (ví dụ khách tìm nồi cơm điện thì KHÔNG được gợi ý ổ điện hay cây lau nhà trừ khi là sản phẩm mua kèm hợp lý). Nếu chỉ có 1-2 sản phẩm phù hợp, chỉ trả về các sản phẩm đó. Chỉ trả về JSON thuần, không markdown, không giải thích ngoài JSON.";

        const responseLanguageInstruction = isEnglish
          ? "Write every human-readable field in English."
          : "Viết toàn bộ trường nội dung dành cho người dùng bằng tiếng Việt.";

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
            description: p.description ? p.description.slice(0, 150) : "",
            promotionInfo: (p.originalPrice && Number(p.originalPrice) > Number(p.salePrice))
              ? (isEnglish ? `Discounted from ${Number(p.originalPrice)} to ${Number(p.salePrice)}` : `Giảm giá từ ${Number(p.originalPrice)} còn ${Number(p.salePrice)}`)
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

        const aiPromise = openai.chat.completions.create({
          model: provider.modelName,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${systemPrompt} ${responseLanguageInstruction}` },
            { role: "user", content: JSON.stringify(userPayload) }
          ]
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${provider.name} đã quá thời gian chờ`)), 15000)
        );

        const response = await Promise.race([aiPromise, timeoutPromise]);
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
                reason: rec.reason || (isEnglish ? "This product matches the customer's needs." : "Sản phẩm phù hợp với nhu cầu khách hàng."),
                type: rec.type || "NEED_MATCH",
                confidence: Number(rec.confidence || 0.8)
              });
            }
          }

          if (validatedRecs.length > 0) {
            return {
              summary: aiResponse.summary || (isEnglish ? "Suitable products were found." : "Đã phân tích và tìm thấy sản phẩm phù hợp."),
              recommendations: validatedRecs.slice(0, 5),
              bundleSuggestion: aiResponse.bundleSuggestion || "",
              cashierTips: aiResponse.cashierTips || [],
              source: "AI",
              provider: provider.name,
            };
          }
        }
      } catch (aiError: any) {
        console.warn(`[Dịch vụ AI ${provider.name}] bị lỗi hoặc quá thời gian, đang thử dịch vụ tiếp theo...`, aiError?.message || aiError);
      }
    }

    // 5. Nếu tất cả dịch vụ AI đều không dùng được, trả kết quả từ cách chấm điểm có sẵn.
    let finalHeuristicProducts: typeof sortedScored = [];
    if (isNeedSpecified) {
      // Chỉ giữ sản phẩm khớp nhu cầu để tránh đưa ra gợi ý không liên quan.
      const relevantProducts = sortedScored.filter(x => x.relevance > 0);
      if (relevantProducts.length > 0) {
        finalHeuristicProducts = relevantProducts;
      } else {
        // Không có sản phẩm đang còn hàng phù hợp với nhu cầu đã nhập.
        finalHeuristicProducts = [];
      }
    } else {
      finalHeuristicProducts = sortedScored;
    }

    const recommendations: SalesAssistantRecommendation[] = finalHeuristicProducts.slice(0, 5).map((x) => {
      const p = x.product;
      const hasPromo = p.originalPrice && Number(p.originalPrice) > Number(p.salePrice);
      const isSameCategory = cartCategoryIds.includes(p.categoryId);

      let reason = isEnglish ? "This product matches the customer's needs." : "Sản phẩm phù hợp với nhu cầu khách hàng.";
      let type: "NEED_MATCH" | "CROSS_SELL" | "BUDGET_MATCH" | "PROMOTION" = "NEED_MATCH";

      if (isNeedSpecified && x.relevance > 0) {
        type = "NEED_MATCH";
        reason = hasPromo
          ? (isEnglish ? `Matches "${payload.need}" and currently has a good discount.` : `Phù hợp với nhu cầu "${payload.need}" và đang có ưu đãi giảm giá tốt.`)
          : (isEnglish ? `This product matches the search need "${payload.need}".` : `Sản phẩm đáp ứng đúng nhu cầu tìm kiếm "${payload.need}".`);
      } else if (hasPromo) {
        reason = isEnglish ? "This product currently has a good discount." : "Sản phẩm đang có ưu đãi giảm giá tốt.";
        type = "PROMOTION";
      } else if (isSameCategory) {
        reason = isEnglish ? "This product is in the same category and is suitable as an add-on." : "Sản phẩm thuộc cùng nhóm sản phẩm đang chọn, thích hợp mua kèm.";
        type = "CROSS_SELL";
      } else if (budgetMax && Number(p.salePrice) <= budgetMax) {
        reason = isEnglish ? "This product offers good value within the requested budget." : "Sản phẩm giá tốt nằm trong khoảng ngân sách yêu cầu.";
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
        confidence: 0.9
      };
    });

    let summary = "";
    if (isNeedSpecified) {
      if (recommendations.length === 0) {
        summary = isEnglish
          ? `No products matched "${payload.need}"${budgetMax ? " within the selected budget" : ""}. Try another keyword or adjust the budget.`
          : `Không tìm thấy sản phẩm nào phù hợp với nhu cầu "${payload.need}"${
          budgetMax ? " trong khoảng ngân sách đã chọn" : ""
        }. Vui lòng thử từ khóa khác hoặc điều chỉnh ngân sách.`;
      } else {
        summary = isEnglish
          ? `Found ${recommendations.length} products that best match "${payload.need}"${budgetMax ? " within the selected budget" : ""}.`
          : `Đã tìm thấy ${recommendations.length} sản phẩm phù hợp nhất với nhu cầu "${payload.need}"${
          budgetMax ? " trong khoảng ngân sách đã chọn" : ""
        }.`;
      }
    } else {
      summary = isEnglish ? "Quick suggestions for suitable products currently in stock." : "Gợi ý nhanh các sản phẩm phù hợp đang có sẵn.";
    }

    const bundleSuggestion = recommendations.length >= 2
      ? recommendations.slice(0, 3).map(r => r.name).join(" + ")
      : "";

    const cashierTips = recommendations.length > 0 ? [
      isEnglish ? "Remind the customer about warranty and return policies." : "Nhắc khách hàng về chế độ bảo hành và chính sách đổi trả.",
      isEnglish ? "Explain the product's key features and available promotions." : "Tư vấn tính năng nổi bật và ưu đãi kèm theo của sản phẩm."
    ] : [
      isEnglish ? "Suggest widening the budget or searching for a similar product category." : "Gợi ý khách hàng mở rộng khoảng ngân sách hoặc tìm kiếm nhóm sản phẩm tương tự."
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
