import { createAiClient, getConfiguredAiProviders } from "./ai-provider.service";
import { z } from "zod";
import prisma from "../lib/prisma";
import { RECORD_STATUS } from "../constants/app.constants";

// Quy tắc mùa vụ dùng để tăng mức dự báo cho một số nhóm sản phẩm theo từng tháng.
interface SeasonalRule {
  seasonName: string;
  seasonMonths: string;
  reason: string;
  boost: number;
}

const SEASONAL_RULES: Record<string, {
  months: number[];
  rules: Record<string, SeasonalRule>;
}> = {
  hot_season: {
    months: [4, 5, 6, 7, 8],
    rules: {
      "làm sạch": {
        seasonName: "Mùa nóng",
        seasonMonths: "tháng 4–8",
        reason: "Nhu cầu làm sạch nhà cửa, giặt giũ tăng cao trong mùa hè.",
        boost: 1.1,
      },
      "nhà bếp": {
        seasonName: "Mùa nóng",
        seasonMonths: "tháng 4–8",
        reason: "Nhu cầu bảo quản thực phẩm, làm mát và đồ uống lạnh có thể tăng.",
        boost: 1.25,
      },
    },
  },
  year_end_tet: {
    months: [11, 12, 1, 2],
    rules: {
      "nhà bếp": {
        seasonName: "Cuối năm / Tết",
        seasonMonths: "tháng 11–2",
        reason: "Nhu cầu mua sắm đồ gia dụng nhà bếp và nấu nướng thường tăng.",
        boost: 1.3,
      },
      "gia đình": {
        seasonName: "Cuối năm / Tết",
        seasonMonths: "tháng 11–2",
        reason: "Nhu cầu trang hoàng nhà cửa và chuẩn bị cho năm mới tăng cao.",
        boost: 1.2,
      },
      "làm sạch": {
        seasonName: "Mùa dọn dẹp Tết",
        seasonMonths: "tháng 1–2",
        reason: "Người tiêu dùng tập trung dọn dẹp nhà cửa đón Tết Nguyên Đán.",
        boost: 1.35,
      },
    },
  },
};


// Mẫu dữ liệu bắt buộc mà dịch vụ AI phải trả về.
const aiResponseSchema = z.object({
  overview: z.string(),
  stats: z.object({
    lowStock: z.number(),
    outOfStock: z.number(),
    recommended: z.number(),
    safe: z.number(),
    risingTrend: z.number(),
    seasonalHot: z.number(),
    seasonalWatch: z.number().default(0),
  }),
  restockList: z.array(z.object({
    sku: z.string(),
    recommendationType: z.enum([
      "LOW_STOCK",
      "RISING_TREND",
      "SEASONAL_HOT",
      "SEASONAL_WATCH",
      "NO_SIGNAL",
      "CATEGORY_MOMENTUM",
    ]),
    currentStock: z.number(),
    minimumStock: z.number(),
    soldLast7Days: z.number(),
    soldLast30Days: z.number(),
    trendRatio: z.number(),
    seasonBoost: z.number(),
    stockCoverageDays: z.number(),
    suggestedRestockQuantity: z.number(),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    reason: z.string(),
    detailAnalysis: z.object({
      decision: z.string(),
      mainReasons: z.array(z.string()),
      risks: z.array(z.string()),
      actionPlan: z.array(z.string()),
    }),
  })),
});

type InventoryAiResult = z.infer<typeof aiResponseSchema> & {
  source: "AI" | "FORMULA";
  provider?: "Gemini" | "Groq";
  restockList: Array<z.infer<typeof aiResponseSchema>["restockList"][number] & {
    productId: number;
    name: string;
    imageUrl: string;
    seasonName: string | null;
    seasonMonths: string | null;
    seasonReason: string | null;
  }>;
};

// Tìm quy tắc mùa vụ phù hợp với tháng hiện tại và tên danh mục sản phẩm.
function localizeSeasonalRule(rule: SeasonalRule | null, language: "vi" | "en"): SeasonalRule | null {
  if (!rule || language === "vi") return rule;
  const reasonMap: Record<string, string> = {
    "Nhu cầu làm sạch nhà cửa, giặt giũ tăng cao trong mùa hè.": "Demand for home cleaning and laundry typically increases during the hot season.",
    "Nhu cầu bảo quản thực phẩm, làm mát và đồ uống lạnh có thể tăng.": "Demand for food storage, cooling and cold drinks may increase.",
    "Nhu cầu mua sắm đồ gia dụng nhà bếp và nấu nướng thường tăng.": "Demand for kitchen appliances and cooking products typically increases.",
    "Nhu cầu trang hoàng nhà cửa và chuẩn bị cho năm mới tăng cao.": "Demand for home decoration and New Year preparation increases.",
    "Người tiêu dùng tập trung dọn dẹp nhà cửa đón Tết Nguyên Đán.": "Customers focus on cleaning their homes for the Lunar New Year.",
  };
  const nameMap: Record<string, string> = {
    "Mùa nóng": "Hot season",
    "Cuối năm / Tết": "Year-end / Tet",
    "Mùa dọn dẹp Tết": "Tet cleaning season",
  };
  return {
    ...rule,
    seasonName: nameMap[rule.seasonName] || rule.seasonName,
    seasonMonths: rule.seasonMonths.replace("tháng", "months"),
    reason: reasonMap[rule.reason] || rule.reason,
  };
}

function getSeasonalRule(categoryName: string): SeasonalRule | null {
  const currentMonth = new Date().getMonth() + 1;
  const name = categoryName.toLowerCase();

  for (const config of Object.values(SEASONAL_RULES)) {
    if (!config.months.includes(currentMonth)) continue;

    for (const [categoryKeyword, rule] of Object.entries(config.rules)) {
      if (name.includes(categoryKeyword)) return rule;
    }
  }

  return null;
}

// Loại bỏ phần đánh dấu thừa để có thể chuyển câu trả lời AI thành dữ liệu JSON.
function cleanAiJson(raw: string) {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export const inventoryAiService = {
  // Phân tích tình trạng kho và đưa ra gợi ý nhập hàng cho số ngày dự phòng đã chọn.
  async forecast(days: number, language: "vi" | "en" = "vi"): Promise<InventoryAiResult> {
    const isEnglish = language === "en";
    // 1. Lấy toàn bộ sản phẩm đang hoạt động cùng số lượng tồn và danh mục.
    const products = await prisma.product.findMany({
      where: { status: RECORD_STATUS.ACTIVE as any },
      select: {
        id: true,
        sku: true,
        name: true,
        imageUrl: true,
        stockQuantity: true,
        minStock: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });

    // 2. Xác định hai khoảng thời gian cần so sánh: 7 ngày và 30 ngày gần nhất.
    const date30DaysAgo = new Date();
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);
    date30DaysAgo.setHours(0, 0, 0, 0);

    const date7DaysAgo = new Date();
    date7DaysAgo.setDate(date7DaysAgo.getDate() - 7);
    date7DaysAgo.setHours(0, 0, 0, 0);

    // 3. Lấy chi tiết các đơn đã hoàn tất hoặc đã thanh toán, bỏ đơn hủy và hoàn tiền.
    const orderDetails = await prisma.orderDetail.findMany({
      where: {
        createdAt: { gte: date30DaysAgo },
        product: { status: RECORD_STATUS.ACTIVE },
        order: {
          OR: [
            { status: "COMPLETED" },
            { payment: { status: "PAID" } },
          ],
          NOT: [
            { status: "CANCELLED" },
            { payment: { status: "REFUNDED" } },
          ],
        },
      },
      select: {
        productId: true,
        quantity: true,
        createdAt: true,
      },
    });

    // 4. Cộng tổng số lượng bán của từng sản phẩm trong 7 ngày và 30 ngày.
    const sales30Map = new Map<number, number>();
    const sales7Map = new Map<number, number>();
    for (const orderDetail of orderDetails) {
      sales30Map.set(
        orderDetail.productId,
        (sales30Map.get(orderDetail.productId) || 0) + orderDetail.quantity,
      );
      if (new Date(orderDetail.createdAt) >= date7DaysAgo) {
        sales7Map.set(
          orderDetail.productId,
          (sales7Map.get(orderDetail.productId) || 0) + orderDetail.quantity,
        );
      }
    }

    // 5. Cộng doanh số theo danh mục để biết cả nhóm sản phẩm đang tăng hay giảm.
    const productsById = new Map(products.map((product) => [product.id, product]));
    const categorySales30Map = new Map<number, number>();
    const categorySales7Map = new Map<number, number>();
    for (const orderDetail of orderDetails) {
      const product = productsById.get(orderDetail.productId);
      if (!product) continue;

      categorySales30Map.set(
        product.categoryId,
        (categorySales30Map.get(product.categoryId) || 0) + orderDetail.quantity,
      );
      if (new Date(orderDetail.createdAt) >= date7DaysAgo) {
        categorySales7Map.set(
          product.categoryId,
          (categorySales7Map.get(product.categoryId) || 0) + orderDetail.quantity,
        );
      }
    }

    // 6. Tính mức thay đổi sức bán của từng danh mục.
    const categoryTrendRatioMap = new Map<number, number>();
    for (const product of products) {
      if (categoryTrendRatioMap.has(product.categoryId)) continue;
      const average30 = (categorySales30Map.get(product.categoryId) || 0) / 30;
      const average7 = (categorySales7Map.get(product.categoryId) || 0) / 7;
      categoryTrendRatioMap.set(product.categoryId, average30 > 0 ? average7 / average30 : 1);
    }

    // 7. Tính nhu cầu dự kiến, số ngày đủ bán và số lượng nên nhập cho từng sản phẩm.
    const forecastList = products.map((product) => {
      const soldLast30Days = sales30Map.get(product.id) || 0;
      const soldLast7Days = sales7Map.get(product.id) || 0;
      const avgDailySales7 = soldLast7Days / 7;
      const avgDailySales30 = soldLast30Days / 30;
      const trendRatio = avgDailySales30 > 0
        ? avgDailySales7 / avgDailySales30
        : (soldLast7Days > 0 ? 2 : 1);
      const stockCoverageDays = avgDailySales7 > 0
        ? product.stockQuantity / avgDailySales7
        : 999;
      const categoryTrendRatio = categoryTrendRatioMap.get(product.categoryId) || 1;
      const seasonalRule = localizeSeasonalRule(getSeasonalRule(product.category?.name || ""), language);
      const seasonBoost = seasonalRule?.boost || 1;
      const predictedDailySales = avgDailySales30 * trendRatio * categoryTrendRatio * seasonBoost;
      const expectedDemand = predictedDailySales * days;
      const safetyStock = expectedDemand * 0.2;
      const currentStock = product.stockQuantity;
      const minimumStock = product.minStock;
      const minimumGap = Math.max(0, minimumStock - currentStock);
      const demandGap = Math.max(0, Math.ceil(expectedDemand + safetyStock - currentStock));
      let suggestedRestockQuantity = Math.max(minimumGap, demandGap);

      if (currentStock >= minimumStock && (stockCoverageDays > 60 || currentStock >= expectedDemand + safetyStock)) {
        suggestedRestockQuantity = 0;
      }

      if (soldLast7Days === 0 && soldLast30Days === 0) {
        suggestedRestockQuantity = currentStock < minimumStock ? minimumGap : 0;
      }

      const hasSales = soldLast7Days > 0 || soldLast30Days > 0;
      let recommendationType = "NO_SIGNAL";
      if (seasonalRule && hasSales) {
        recommendationType = "SEASONAL_HOT";
      } else if ((trendRatio >= 1.25 || categoryTrendRatio >= 1.2) && hasSales) {
        recommendationType = "RISING_TREND";
      } else if (seasonalRule && !hasSales) {
        recommendationType = "SEASONAL_WATCH";
      } else if (categoryTrendRatio >= 1.2 && hasSales) {
        recommendationType = "CATEGORY_MOMENTUM";
      } else if (currentStock <= minimumStock || currentStock <= 0) {
        recommendationType = "LOW_STOCK";
      }

      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        imageUrl: product.imageUrl || "",
        currentStock,
        minimumStock,
        soldLast7Days,
        soldLast30Days,
        avgDailySales: avgDailySales30,
        predictedDailySales,
        expectedDemand,
        suggestedRestockQuantity,
        trendRatio,
        categoryTrendRatio,
        seasonBoost,
        seasonName: seasonalRule?.seasonName || null,
        seasonMonths: seasonalRule?.seasonMonths || null,
        seasonReason: seasonalRule?.reason || null,
        stockCoverageDays,
        recommendationType,
        categoryName: product.category?.name || "",
      };
    });

    // 8. Chỉ giữ những sản phẩm có dấu hiệu cần chú ý để đưa vào danh sách phân tích.
    const candidates = forecastList.filter((item) =>
      item.suggestedRestockQuantity > 0
      || item.currentStock <= item.minimumStock
      || item.trendRatio >= 1.3
      || item.categoryTrendRatio >= 1.2
      || item.seasonBoost >= 1.2
      || item.stockCoverageDays <= days * 2,
    );

    // 9. Ưu tiên sản phẩm hết hàng, tồn thấp, sắp cạn và đang bán nhanh.
    candidates.sort((a, b) => {
      const outOfStockDifference = Number(b.currentStock <= 0) - Number(a.currentStock <= 0);
      if (outOfStockDifference) return outOfStockDifference;
      const lowStockDifference = Number(b.currentStock <= b.minimumStock) - Number(a.currentStock <= a.minimumStock);
      if (lowStockDifference) return lowStockDifference;
      if (a.stockCoverageDays !== b.stockCoverageDays) return a.stockCoverageDays - b.stockCoverageDays;
      if (b.soldLast30Days !== a.soldLast30Days) return b.soldLast30Days - a.soldLast30Days;
      if (b.trendRatio !== a.trendRatio) return b.trendRatio - a.trendRatio;
      return b.suggestedRestockQuantity - a.suggestedRestockQuantity;
    });

    // Chỉ gửi tối đa 40 sản phẩm quan trọng nhất sang dịch vụ AI.
    const topCandidates = candidates.slice(0, 40);
    const fallbackStats = {
      lowStock: candidates.filter((item) => item.currentStock <= item.minimumStock && item.currentStock > 0).length,
      outOfStock: candidates.filter((item) => item.currentStock <= 0).length,
      recommended: candidates.filter((item) => item.suggestedRestockQuantity > 0).length,
      safe: Math.max(0, products.length - candidates.filter((item) => item.currentStock <= item.minimumStock || item.suggestedRestockQuantity > 0).length),
      risingTrend: candidates.filter((item) => item.recommendationType === "RISING_TREND").length,
      seasonalHot: candidates.filter((item) => item.recommendationType === "SEASONAL_HOT").length,
      seasonalWatch: candidates.filter((item) => item.recommendationType === "SEASONAL_WATCH").length,
    };

    // Tạo sẵn kết quả dự phòng bằng công thức để dùng khi các dịch vụ AI đều gặp lỗi.
    const fallbackRestockList: z.infer<typeof aiResponseSchema>["restockList"] = candidates
      .map((candidate) => {
        let priority: "HIGH" | "MEDIUM" | "LOW" = candidate.currentStock <= 0
          ? "HIGH"
          : (candidate.currentStock <= candidate.minimumStock ? "MEDIUM" : "LOW");
        let confidence: "HIGH" | "MEDIUM" | "LOW" = candidate.trendRatio >= 1.5
          ? "HIGH"
          : (candidate.trendRatio >= 1.1 ? "MEDIUM" : "LOW");
        if (candidate.soldLast7Days === 0 && candidate.soldLast30Days === 0) {
          priority = candidate.currentStock < candidate.minimumStock ? "MEDIUM" : "LOW";
          confidence = "LOW";
        }

        const isNoRestockNeeded = candidate.suggestedRestockQuantity <= 0;
        let reason = isNoRestockNeeded
          ? (isEnglish ? `Current stock (${candidate.currentStock}) is above the minimum (${candidate.minimumStock}). No restock is needed.` : `Tồn kho hiện tại (${candidate.currentStock}) đã vượt mức tối thiểu (${candidate.minimumStock}). Chưa cần nhập thêm.`)
          : (isEnglish ? `For a ${days}-day forecast, current stock (${candidate.currentStock}) is below or close to expected demand (${Math.ceil(candidate.expectedDemand)}).` : `Dự phòng ${days} ngày. Tồn kho hiện tại (${candidate.currentStock}) thấp hơn hoặc sắp hết so với nhu cầu dự kiến (${Math.ceil(candidate.expectedDemand)}).`);
        if (!isNoRestockNeeded) {
          if (candidate.recommendationType === "RISING_TREND") {
            reason = isEnglish ? "Sales increased strongly in the last 7 days. Prepare a restock to avoid running out." : `Tốc độ bán tăng mạnh trong 7 ngày qua (tỷ lệ tăng trưởng ${candidate.trendRatio.toFixed(2)}x). Cần chuẩn bị nhập hàng để tránh đứt hàng.`;
          } else if (candidate.recommendationType === "SEASONAL_HOT") {
            reason = isEnglish ? "This product has seasonal demand and demand is expected to increase quickly." : `Sản phẩm xu hướng mùa vụ (hệ số boost ${candidate.seasonBoost.toFixed(2)}x). Dự báo nhu cầu sẽ tăng nhanh.`;
          } else if (candidate.recommendationType === "CATEGORY_MOMENTUM") {
            reason = isEnglish ? "This product category is showing strong growth." : `Danh mục sản phẩm đang có tín hiệu tăng trưởng mạnh (tỷ lệ danh mục ${candidate.categoryTrendRatio.toFixed(2)}x).`;
          }
        }

        const decision = isNoRestockNeeded
          ? (isEnglish ? `No restock is needed. Current stock (${candidate.currentStock} items) is sufficient.` : `Chưa cần nhập thêm. Lượng tồn kho hiện tại (${candidate.currentStock} sản phẩm) đã đủ đáp ứng nhu cầu.`)
          : (isEnglish ? `Restock ${candidate.suggestedRestockQuantity} items.` : `Đề xuất nhập thêm ${candidate.suggestedRestockQuantity} sản phẩm.`);

        const mainReasons = isNoRestockNeeded
          ? [
              isEnglish ? `Current stock (${candidate.currentStock} items) is above the minimum threshold (${candidate.minimumStock} items).` : `Tồn kho hiện tại (${candidate.currentStock} sản phẩm) đã vượt ngưỡng tối thiểu (${candidate.minimumStock} sản phẩm).`,
              isEnglish ? `Estimated coverage is ${candidate.stockCoverageDays > 180 ? "> 180 days" : `~${Math.floor(candidate.stockCoverageDays)} days`}.` : `Thời gian đủ bán dự kiến kéo dài (${candidate.stockCoverageDays > 180 ? "> 180 ngày" : `~${Math.floor(candidate.stockCoverageDays)} ngày`}).`,
              isEnglish ? "Sales are stable with no current risk of running out." : "Tốc độ bán hàng ở mức ổn định, chưa có nguy cơ đứt hàng.",
            ]
          : [
              isEnglish ? `Current stock (${candidate.currentStock} items) is below forecast demand.` : `Tồn kho hiện tại (${candidate.currentStock} sản phẩm) thấp hơn so với nhu cầu dự phòng dự kiến.`,
              isEnglish ? `${candidate.soldLast30Days} items were sold in the last 30 days.` : `Lượng bán hàng 30 ngày qua ghi nhận ${candidate.soldLast30Days} sản phẩm.`,
              candidate.trendRatio > 1.05
                ? (isEnglish ? "Recent sales are rising strongly." : "Tốc độ bán hàng gần đây có xu hướng tăng mạnh.")
                : candidate.trendRatio < 0.95
                  ? (isEnglish ? "Recent sales have decreased slightly." : "Tốc độ bán hàng gần đây có xu hướng giảm nhẹ.")
                  : (isEnglish ? "Recent sales remain stable." : "Tốc độ bán hàng gần đây duy trì ổn định."),
              candidate.seasonBoost > 1
                ? (isEnglish ? "The product is entering a peak seasonal period." : "Sản phẩm đang bước vào giai đoạn mùa vụ cao điểm.")
                : (isEnglish ? "No clear seasonal change has been recorded." : "Sản phẩm chưa ghi nhận biến động mùa vụ rõ nét."),
              isEnglish ? `Forecast demand for the next ${days} days is about ${Math.ceil(candidate.expectedDemand)} items.` : `Nhu cầu dự phòng dự kiến trong ${days} ngày tới khoảng ${Math.ceil(candidate.expectedDemand)} sản phẩm.`,
            ];

        const risks = isNoRestockNeeded
          ? [isEnglish ? "Additional stock may tie up capital and occupy warehouse space." : "Nguy cơ tồn đọng vốn và chiếm dụng không gian kho nếu nhập thêm hàng."]
          : [
              isEnglish ? "There is a risk of running out and losing sales without an early restock." : "Nguy cơ đứt hàng và mất doanh thu nếu không nhập sớm.",
              isEnglish ? "Capital may be tied up if sales slow down." : "Khả năng tồn đọng vốn nếu tốc độ bán giảm.",
            ];

        const actionPlan = isNoRestockNeeded
          ? [
              isEnglish ? "Do not create a new purchase order at this time." : "Chưa cần tạo đơn nhập hàng mới vào lúc này.",
              isEnglish ? "Continue monitoring changes in demand." : "Tiếp tục định kỳ theo dõi biến động sức mua.",
            ]
          : [
              isEnglish ? `Contact the supplier to prepare an order for ${candidate.suggestedRestockQuantity} items.` : `Liên hệ nhà cung cấp để chuẩn bị đơn hàng nhập ${candidate.suggestedRestockQuantity} sản phẩm.`,
              isEnglish ? "Review weekly sales and adjust the plan." : "Theo dõi tốc độ bán hàng tuần để điều chỉnh.",
            ];

        return {
          sku: candidate.sku,
          recommendationType: candidate.recommendationType as z.infer<typeof aiResponseSchema>["restockList"][number]["recommendationType"],
          currentStock: candidate.currentStock,
          minimumStock: candidate.minimumStock,
          soldLast7Days: candidate.soldLast7Days,
          soldLast30Days: candidate.soldLast30Days,
          trendRatio: Number(candidate.trendRatio.toFixed(2)),
          seasonBoost: Number(candidate.seasonBoost.toFixed(2)),
          stockCoverageDays: candidate.stockCoverageDays === 999 ? 999 : Number(candidate.stockCoverageDays.toFixed(1)),
          suggestedRestockQuantity: candidate.suggestedRestockQuantity,
          priority,
          confidence,
          reason,
          detailAnalysis: {
            decision,
            mainReasons,
            risks,
            actionPlan,
          },
        };
      })
      .slice(0, 12);

    // Gói kết quả dự phòng gồm phần tổng quan, thống kê và tối đa 12 sản phẩm.
    const fallbackResponse: z.infer<typeof aiResponseSchema> = {
      overview: isEnglish ? `The system calculated demand for the next ${days} days from sales and trends. ${fallbackStats.recommended} products need restocking, including ${fallbackStats.outOfStock} out of stock, ${fallbackStats.lowStock} low stock, ${fallbackStats.risingTrend} with rising demand and ${fallbackStats.seasonalHot} with seasonal demand.` : `Hệ thống tự động tính toán nhu cầu dự phòng cho ${days} ngày tới dựa trên doanh số và xu hướng. Phát hiện ${fallbackStats.recommended} sản phẩm cần nhập thêm, bao gồm ${fallbackStats.outOfStock} sản phẩm hết hàng, ${fallbackStats.lowStock} sản phẩm tồn kho thấp, ${fallbackStats.risingTrend} sản phẩm xu hướng tăng mạnh, và ${fallbackStats.seasonalHot} sản phẩm hot theo mùa.`,
      stats: fallbackStats,
      restockList: fallbackRestockList,
    };

    let finalResult = fallbackResponse;
    let selectedProvider: "Gemini" | "Groq" | undefined;
    // Lập danh sách dịch vụ AI theo thứ tự: Gemini rồi Groq.
    const aiProviders = getConfiguredAiProviders();

    // Thử từng dịch vụ; dịch vụ nào trả kết quả hợp lệ trước thì sử dụng kết quả đó.
    if (aiProviders.length > 0 && topCandidates.length > 0) {
      for (const provider of aiProviders) {
        try {
          const openai = createAiClient(provider);
          const systemPrompt =
            "Bạn là chuyên gia quản trị chuỗi cung ứng cho cửa hàng bán lẻ đồ gia dụng Homex. Hãy phân tích dữ liệu từ `candidateProducts` và trả về duy nhất JSON thuần túy (không bọc markdown). YÊU CẦU: 1) Mảng `restockList` trong JSON trả về BẮT BUỘC phải chứa ĐẦY ĐỦ các sản phẩm trong `candidateProducts`. Phân loại `recommendationType` chính xác: `LOW_STOCK` (tồn thấp/hết hàng), `RISING_TREND` (xu hướng bán tăng nhanh gần đây), `SEASONAL_HOT` (hot mùa cao điểm và có doanh số), `SEASONAL_WATCH` (mùa vụ tiềm năng), `CATEGORY_MOMENTUM` (danh mục đang tăng trưởng), `NO_SIGNAL` (chưa có tín hiệu rõ nét). 2) Tuyệt đối không dùng các chỉ số kỹ thuật thô như 'trendRatio', 'seasonBoost', '1.25x' trong các đoạn văn mô tả của `detailAnalysis`. Hãy diễn đạt hoàn toàn bằng tiếng Việt nghiệp vụ quản lý kho dễ hiểu. 3) Nếu sản phẩm có bán 7 ngày và 30 ngày đều bằng 0 nhưng tồn kho thấp hơn mức tối thiểu, gợi ý nhập bù đủ mức tối thiểu với priority = 'MEDIUM'. Chỉ đặt suggestedRestockQuantity = 0 khi tồn kho đã bằng hoặc vượt mức tối thiểu.";
          const responseLanguageInstruction = isEnglish ? "Write every human-readable field in English." : "Viết toàn bộ nội dung dành cho người dùng bằng tiếng Việt.";
          const userPrompt = {
            days,
            candidateProducts: topCandidates.map((candidate) => ({
              sku: candidate.sku,
              name: candidate.name,
              categoryName: candidate.categoryName,
              recommendationType: candidate.recommendationType,
              currentStock: candidate.currentStock,
              minimumStock: candidate.minimumStock,
              soldLast7Days: candidate.soldLast7Days,
              soldLast30Days: candidate.soldLast30Days,
              trendRatio: Number(candidate.trendRatio.toFixed(2)),
              categoryTrendRatio: Number(candidate.categoryTrendRatio.toFixed(2)),
              seasonBoost: Number(candidate.seasonBoost.toFixed(2)),
              stockCoverageDays: candidate.stockCoverageDays === 999 ? 999 : Number(candidate.stockCoverageDays.toFixed(1)),
              suggestedRestockQuantity: candidate.suggestedRestockQuantity,
            })),
            fallbackStats,
            requiredJsonShape: {
              overview: "Nhận định chung về tình hình kho...",
              stats: {
                lowStock: "number",
                outOfStock: "number",
                recommended: "number",
                safe: "number",
                risingTrend: "number",
                seasonalHot: "number",
                seasonalWatch: "number",
              },
              restockList: [{
                sku: "string",
                recommendationType: "LOW_STOCK | RISING_TREND | SEASONAL_HOT | SEASONAL_WATCH | NO_SIGNAL",
                currentStock: "number",
                minimumStock: "number",
                soldLast7Days: "number",
                soldLast30Days: "number",
                trendRatio: "number",
                seasonBoost: "number",
                stockCoverageDays: "number",
                suggestedRestockQuantity: "number",
                priority: "HIGH | MEDIUM | LOW",
                confidence: "HIGH | MEDIUM | LOW",
                reason: "Lý do ngắn gọn...",
                detailAnalysis: {
                  decision: "Quyết định nhập...",
                  mainReasons: ["string"],
                  risks: ["string"],
                  actionPlan: ["string"],
                },
              }],
            },
          };

          const aiPromise = openai.chat.completions.create({
            model: provider.modelName,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `${systemPrompt} ${responseLanguageInstruction}` },
              { role: "user", content: JSON.stringify(userPrompt) },
            ],
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${provider.name} đã quá thời gian chờ phân tích kho`)), 10000)
          );

          const response = await Promise.race([aiPromise, timeoutPromise]);
          const parsedAi = JSON.parse(cleanAiJson(response.choices[0]?.message?.content || "{}"));
          const validatedAi = aiResponseSchema.parse(parsedAi);
          const filteredList = validatedAi.restockList.filter((item) =>
            topCandidates.some((candidate) => candidate.sku === item.sku),
          );
          if (filteredList.length > 0) {
            const aiItemMap = new Map(filteredList.map((item) => [item.sku, item]));
            const mergedRestockList = fallbackRestockList.map((item) => aiItemMap.get(item.sku) || item);
            finalResult = {
              overview: validatedAi.overview,
              stats: validatedAi.stats,
              restockList: mergedRestockList,
            };
            selectedProvider = provider.name;
            break; // Dừng lại sau khi một dịch vụ AI trả kết quả thành công.
          }
        } catch (aiError) {
          console.warn(`[Dịch vụ AI Kho ${provider.name}] bị lỗi hoặc quá thời gian, đang thử dịch vụ tiếp theo...`, aiError);
        }
      }
    }

    // Kiểm tra lại kết quả và ghép tên, hình ảnh, mùa vụ từ dữ liệu sản phẩm thật.
    const enrichedList = finalResult.restockList.map((item) => {
      const matchedProduct = forecastList.find((product) => product.sku === item.sku);
      const seasonName = matchedProduct?.seasonName || null;
      const seasonMonths = matchedProduct?.seasonMonths || null;
      const seasonReason = matchedProduct?.seasonReason || null;
      let recommendationType = item.recommendationType;
      if (recommendationType === "SEASONAL_HOT" && (!seasonName || !seasonReason)) {
        recommendationType = matchedProduct?.trendRatio && matchedProduct.trendRatio >= 1.3
          ? "RISING_TREND"
          : "CATEGORY_MOMENTUM";
      }

      let suggestedRestockQuantity = item.suggestedRestockQuantity;
      const currentStock = item.currentStock;
      const minimumStock = item.minimumStock;
      const stockCoverageDays = item.stockCoverageDays;

      if (currentStock >= minimumStock && (stockCoverageDays > 60 || suggestedRestockQuantity <= 0)) {
        suggestedRestockQuantity = 0;
      }

      let detailAnalysis = item.detailAnalysis;
      if (suggestedRestockQuantity === 0) {
        detailAnalysis = {
          decision: isEnglish ? `No restock is needed. Current stock (${currentStock} items) is sufficient.` : `Chưa cần nhập thêm. Lượng tồn kho hiện tại (${currentStock} sản phẩm) đã đủ đáp ứng nhu cầu.`,
          mainReasons: [
            isEnglish ? `Current stock (${currentStock} items) is above the minimum threshold (${minimumStock} items).` : `Tồn kho hiện tại (${currentStock} SP) đã vượt ngưỡng tối thiểu (${minimumStock} SP).`,
            isEnglish ? `Estimated coverage is ${stockCoverageDays > 180 ? "> 180 days" : `~${Math.floor(stockCoverageDays)} days`}.` : `Thời gian đủ bán dự kiến kéo dài (${stockCoverageDays > 180 ? "> 180 ngày" : `~${Math.floor(stockCoverageDays)} ngày`}).`,
            isEnglish ? "Sales are stable with no current stock shortage risk." : "Tốc độ bán hàng ở mức ổn định, chưa có nguy cơ thiếu hụt kho.",
          ],
          risks: [
            isEnglish ? "Additional stock may tie up capital and occupy warehouse space." : "Nguy cơ tồn đọng vốn và chiếm dụng không gian kho nếu nhập thêm.",
          ],
          actionPlan: [
            isEnglish ? "Do not create a new purchase order at this time." : "Chưa cần tạo đơn nhập hàng mới vào lúc này.",
            isEnglish ? "Continue monitoring changes in demand." : "Tiếp tục định kỳ theo dõi biến động sức mua.",
          ],
        };
      }

      return {
        ...item,
        suggestedRestockQuantity,
        detailAnalysis,
        recommendationType,
        productId: matchedProduct?.productId || 0,
        name: matchedProduct?.name || (isEnglish ? "Unknown product" : "Sản phẩm không xác định"),
        imageUrl: matchedProduct?.imageUrl || "",
        seasonName,
        seasonMonths,
        seasonReason,
      };
    });

    return {
      overview: finalResult.overview,
      stats: finalResult.stats,
      restockList: enrichedList,
      source: selectedProvider ? "AI" : "FORMULA",
      provider: selectedProvider,
    };
  },
};
