import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import OpenAI from "openai";
import {
  authenticateToken,
  authorizeRoles,
  AuthRequest,
} from "../middlewares/auth.middleware";
import {
  USER_ROLES,
  RECORD_STATUS,
  STOCK_TRANSACTION_TYPE,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { createAuditLog } from "../utils/audit";

const router = Router();

function normalizeProductPrice(value: Prisma.Decimal | number | string | null | undefined) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;

  return numberValue >= 10000 ? Math.round(numberValue / 1000) : numberValue;
}

const stockTransactionInclude = {
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      stockQuantity: true,
      minStock: true,
      status: true,
    },
  },
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  order: {
    select: {
      id: true,
      orderCode: true,
      status: true,
    },
  },
} satisfies Prisma.StockTransactionInclude;

const lowStockProductInclude = {
  category: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  supplier: {
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
    },
  },
} satisfies Prisma.ProductInclude;

type StockTransactionWithRelations = Prisma.StockTransactionGetPayload<{
  include: typeof stockTransactionInclude;
}>;

type LowStockProduct = Prisma.ProductGetPayload<{
  include: typeof lowStockProductInclude;
}>;

const stockTransactionTypeSchema = z.enum([
  STOCK_TRANSACTION_TYPE.IMPORT,
  STOCK_TRANSACTION_TYPE.SALE,
  STOCK_TRANSACTION_TYPE.ADJUSTMENT,
  STOCK_TRANSACTION_TYPE.RESTORE,
]);

const optionalNoteSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(255, "Ghi chú không được vượt quá 255 ký tự")
    .optional()
);

const importStockSchema = z.object({
  productId: z.coerce
    .number()
    .int("ID sản phẩm phải là số nguyên")
    .positive("ID sản phẩm không hợp lệ"),

  quantity: z.coerce
    .number()
    .int("Số lượng nhập phải là số nguyên")
    .positive("Số lượng nhập phải lớn hơn 0")
    .max(100000, "Số lượng nhập quá lớn"),

  note: optionalNoteSchema,
});

const adjustStockSchema = z.object({
  productId: z.coerce
    .number()
    .int("ID sản phẩm phải là số nguyên")
    .positive("ID sản phẩm không hợp lệ"),

  newQuantity: z.coerce
    .number()
    .int("Số lượng tồn mới phải là số nguyên")
    .min(0, "Số lượng tồn mới không được âm")
    .max(100000, "Số lượng tồn mới quá lớn"),

  note: optionalNoteSchema,
});

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getPositiveId(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function getDateValue(value: unknown, fieldName: string) {
  if (!value) {
    return null;
  }

  const dateValue = new Date(String(value));

  if (Number.isNaN(dateValue.getTime())) {
    throw new AppError(`${fieldName} không hợp lệ`, 400);
  }

  return dateValue;
}

function getAuthenticatedUserId(req: AuthRequest) {
  if (!req.user || !req.user.userId) {
    throw new AppError("Bạn chưa đăng nhập", 401);
  }

  return req.user.userId;
}

function validateParseResult<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError }
) {
  if (!result.success) {
    throw new AppError(
      result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
      400
    );
  }

  return result.data;
}

function formatStockTransaction(transaction: StockTransactionWithRelations) {
  return {
    id: transaction.id,
    productId: transaction.productId,
    userId: transaction.userId,
    orderId: transaction.orderId,
    type: transaction.type,
    quantity: transaction.quantity,
    note: transaction.note,
    createdAt: transaction.createdAt,
    product: transaction.product,
    user: transaction.user,
    order: transaction.order,
  };
}

function formatLowStockProduct(product: LowStockProduct) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    category: product.category,
    supplier: product.supplier,
    costPrice: normalizeProductPrice(product.costPrice),
    salePrice: normalizeProductPrice(product.salePrice),
    stockQuantity: product.stockQuantity,
    minStock: product.minStock,
    warrantyMonths: product.warrantyMonths,
    qrCode: product.qrCode,
    imageUrl: product.imageUrl,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

async function checkActiveProduct(productId: number) {
  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (!product) {
    throw new AppError("Không tìm thấy sản phẩm", 404);
  }

  if (product.status !== RECORD_STATUS.ACTIVE) {
    throw new AppError("Sản phẩm đang ngừng hoạt động", 400);
  }

  return product;
}

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
  "hot_season": {
    months: [4, 5, 6, 7, 8],
    rules: {
      "làm sạch": {
        seasonName: "Mùa nóng",
        seasonMonths: "tháng 4–8",
        reason: "Nhu cầu làm sạch nhà cửa, giặt giũ tăng cao trong mùa hè.",
        boost: 1.1
      },
      "nhà bếp": {
        seasonName: "Mùa nóng",
        seasonMonths: "tháng 4–8",
        reason: "Nhu cầu bảo quản thực phẩm, làm mát và đồ uống lạnh có thể tăng.",
        boost: 1.25
      }
    }
  },
  "year_end_tet": {
    months: [11, 12, 1, 2],
    rules: {
      "nhà bếp": {
        seasonName: "Cuối năm / Tết",
        seasonMonths: "tháng 11–2",
        reason: "Nhu cầu mua sắm đồ gia dụng nhà bếp và nấu nướng thường tăng.",
        boost: 1.3
      },
      "gia đình": {
        seasonName: "Cuối năm / Tết",
        seasonMonths: "tháng 11–2",
        reason: "Nhu cầu trang hoàng nhà cửa và chuẩn bị cho năm mới tăng cao.",
        boost: 1.2
      },
      "làm sạch": {
        seasonName: "Mùa dọn dẹp Tết",
        seasonMonths: "tháng 1–2",
        reason: "Người tiêu dùng tập trung dọn dẹp nhà cửa đón Tết Nguyên Đán.",
        boost: 1.35
      }
    }
  }
};

function getSeasonalRule(categoryName: string): SeasonalRule | null {
  const currentMonth = new Date().getMonth() + 1;
  const name = categoryName.toLowerCase();

  for (const [key, config] of Object.entries(SEASONAL_RULES)) {
    if (config.months.includes(currentMonth)) {
      for (const [catKeyword, rule] of Object.entries(config.rules)) {
        if (name.includes(catKeyword)) {
          return rule;
        }
      }
    }
  }
  return null;
}

function getSeasonBoost(categoryName: string): number {
  const rule = getSeasonalRule(categoryName);
  return rule ? rule.boost : 1.0;
}

// GET /api/inventory/low-stock?page=1&limit=10&search=
router.get(
  "/low-stock",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();

    const where: Prisma.ProductWhereInput = {
      status: RECORD_STATUS.ACTIVE,
      stockQuantity: {
        lte: prisma.product.fields.minStock,
      },
    };

    if (search) {
      where.OR = [
        {
          sku: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [products, totalItems] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: lowStockProductInclude,
        orderBy: [
          {
            stockQuantity: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: limit,
      }),
      prisma.product.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách sản phẩm sắp hết hàng thành công",
      data: {
        items: products.map(formatLowStockProduct),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
        },
      },
    });
  })
);

// GET /api/inventory/ai-forecast?days=15
router.get(
  "/ai-forecast",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    // 1. Parse days (reserveDays)
    const days = Math.max(1, Number(req.query.days || 15));

    // 2. Fetch all ACTIVE products with their category details
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
        category: {
          select: {
            name: true,
          }
        }
      },
    });

    // 3. Fetch sales for the last 30 days
    const date30DaysAgo = new Date();
    date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);
    date30DaysAgo.setHours(0, 0, 0, 0);

    const date7DaysAgo = new Date();
    date7DaysAgo.setDate(date7DaysAgo.getDate() - 7);
    date7DaysAgo.setHours(0, 0, 0, 0);

    const orderDetails = await prisma.orderDetail.findMany({
      where: {
        createdAt: { gte: date30DaysAgo },
        product: { status: "ACTIVE" },
        order: {
          OR: [
            { status: "COMPLETED" },
            { payment: { status: "PAID" } }
          ],
          NOT: [
            { status: "CANCELLED" },
            { payment: { status: "REFUNDED" } }
          ]
        }
      },
      select: {
        productId: true,
        quantity: true,
        createdAt: true,
      }
    });

    // 4. Summarize sales by product in memory
    const sales30Map = new Map<number, number>();
    const sales7Map = new Map<number, number>();

    for (const od of orderDetails) {
      const pid = od.productId;
      const qty = od.quantity;
      const createdAt = new Date(od.createdAt || new Date());

      sales30Map.set(pid, (sales30Map.get(pid) || 0) + qty);

      if (createdAt >= date7DaysAgo) {
        sales7Map.set(pid, (sales7Map.get(pid) || 0) + qty);
      }
    }

    // 5. Summarize sales by category in memory for categoryTrendRatio calculation
    const categorySales30Map = new Map<number, number>();
    const categorySales7Map = new Map<number, number>();

    for (const od of orderDetails) {
      const product = products.find(p => p.id === od.productId);
      if (!product) continue;
      const cid = product.categoryId;
      const qty = od.quantity;
      const createdAt = new Date(od.createdAt || new Date());

      categorySales30Map.set(cid, (categorySales30Map.get(cid) || 0) + qty);

      if (createdAt >= date7DaysAgo) {
        categorySales7Map.set(cid, (categorySales7Map.get(cid) || 0) + qty);
      }
    }

    const categoryTrendRatioMap = new Map<number, number>();
    for (const product of products) {
      const cid = product.categoryId;
      if (categoryTrendRatioMap.has(cid)) continue;

      const catSold30 = categorySales30Map.get(cid) || 0;
      const catSold7 = categorySales7Map.get(cid) || 0;

      const catAvgDailySales30 = catSold30 / 30;
      const catAvgDailySales7 = catSold7 / 7;

      const catTrendRatio = catAvgDailySales30 > 0 ? catAvgDailySales7 / catAvgDailySales30 : 1.0;
      categoryTrendRatioMap.set(cid, catTrendRatio);
    }

    // 6. Calculate forecast data for each product
    const forecastList = products.map(product => {
      const soldLast30Days = sales30Map.get(product.id) || 0;
      const soldLast7Days = sales7Map.get(product.id) || 0;

      const avgDailySales7 = soldLast7Days / 7;
      const avgDailySales30 = soldLast30Days / 30;

      const trendRatio = avgDailySales30 > 0
        ? avgDailySales7 / avgDailySales30
        : (soldLast7Days > 0 ? 2.0 : 1.0);

      const stockCoverageDays = avgDailySales7 > 0
        ? product.stockQuantity / avgDailySales7
        : 999;

      const categoryTrendRatio = categoryTrendRatioMap.get(product.categoryId) || 1.0;
      const seasonalRule = getSeasonalRule(product.category?.name || "");
      const seasonBoost = seasonalRule ? seasonalRule.boost : 1.0;
      const seasonName = seasonalRule ? seasonalRule.seasonName : null;
      const seasonMonths = seasonalRule ? seasonalRule.seasonMonths : null;
      const seasonReason = seasonalRule ? seasonalRule.reason : null;

      // Formula: predictedDailySales = avgDailySales30 * trendRatio * categoryTrendRatio * seasonBoost
      const predictedDailySales = avgDailySales30 * trendRatio * categoryTrendRatio * seasonBoost;
      const expectedDemand = predictedDailySales * days;
      const safetyStock = expectedDemand * 0.2;

      const currentStock = product.stockQuantity;
      const minimumStock = product.minStock;

      const minimumGap = Math.max(0, minimumStock - currentStock);
      const demandGap = Math.max(0, Math.ceil(expectedDemand + safetyStock - currentStock));
      let suggestedRestockQuantity = Math.max(minimumGap, demandGap);

      if (soldLast7Days === 0 && soldLast30Days === 0) {
        suggestedRestockQuantity = 0;
      }

      // Classify recommendationType
      let recommendationType = "NO_SIGNAL";
      const hasSales = soldLast7Days > 0 || soldLast30Days > 0;

      if (currentStock <= minimumStock || currentStock <= 0) {
        recommendationType = "LOW_STOCK";
      } else if (seasonName) {
        recommendationType = hasSales ? "SEASONAL_HOT" : "SEASONAL_WATCH";
      } else if ((trendRatio >= 1.3 || categoryTrendRatio >= 1.2) && hasSales) {
        recommendationType = "RISING_TREND";
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
        seasonName,
        seasonMonths,
        seasonReason,
        stockCoverageDays,
        recommendationType,
        categoryName: product.category?.name || "",
      };
    });

    // 7. Filter and Sort candidates based on new rules
    let candidates = forecastList.filter(
      item => item.suggestedRestockQuantity > 0 ||
              item.currentStock <= item.minimumStock ||
              item.trendRatio >= 1.3 ||
              item.categoryTrendRatio >= 1.2 ||
              item.seasonBoost >= 1.2 ||
              item.stockCoverageDays <= days * 2
    );

    candidates.sort((a, b) => {
      // 1. Out of stock first
      const aOutOfStock = a.currentStock <= 0 ? 1 : 0;
      const bOutOfStock = b.currentStock <= 0 ? 1 : 0;
      if (aOutOfStock !== bOutOfStock) return bOutOfStock - aOutOfStock;

      // 2. Low stock first
      const aLowStock = a.currentStock <= a.minimumStock ? 1 : 0;
      const bLowStock = b.currentStock <= b.minimumStock ? 1 : 0;
      if (aLowStock !== bLowStock) return bLowStock - aLowStock;

      // 3. Stock coverage days ascending
      if (a.stockCoverageDays !== b.stockCoverageDays) {
        return a.stockCoverageDays - b.stockCoverageDays;
      }

      // 4. Sold last 30 days descending
      if (b.soldLast30Days !== a.soldLast30Days) {
        return b.soldLast30Days - a.soldLast30Days;
      }

      // 5. Trend ratio descending
      if (b.trendRatio !== a.trendRatio) {
        return b.trendRatio - a.trendRatio;
      }

      // 6. Restock quantity descending
      return b.suggestedRestockQuantity - a.suggestedRestockQuantity;
    });

    // Take top 40 for AI
    const topCandidates = candidates.slice(0, 40);

    // Calculate fallback statistics and restock list
    const fallbackStats = {
      lowStock: candidates.filter(c => c.currentStock <= c.minimumStock && c.currentStock > 0).length,
      outOfStock: candidates.filter(c => c.currentStock <= 0).length,
      recommended: candidates.filter(c => c.suggestedRestockQuantity > 0).length,
      safe: Math.max(0, products.length - candidates.filter(c => c.currentStock <= c.minimumStock || c.suggestedRestockQuantity > 0).length),
      risingTrend: candidates.filter(c => c.recommendationType === "RISING_TREND").length,
      seasonalHot: candidates.filter(c => c.recommendationType === "SEASONAL_HOT").length,
      seasonalWatch: candidates.filter(c => c.recommendationType === "SEASONAL_WATCH").length,
    };

    const fallbackRestockList = candidates.map(c => {
      let priority = c.currentStock <= 0 ? "HIGH" : (c.currentStock <= c.minimumStock ? "MEDIUM" : "LOW");
      let confidence = c.trendRatio >= 1.5 ? "HIGH" : (c.trendRatio >= 1.1 ? "MEDIUM" : "LOW");
      if (c.soldLast7Days === 0 && c.soldLast30Days === 0) {
        priority = "LOW";
        confidence = "LOW";
      }

      let typeReason = `Dự phòng ${days} ngày. Tồn kho hiện tại (${c.currentStock}) thấp hơn hoặc sắp hết so với nhu cầu dự kiến (${Math.ceil(c.expectedDemand)}).`;
      if (c.recommendationType === "RISING_TREND") {
        typeReason = `Tốc độ bán tăng mạnh trong 7 ngày qua (tỷ lệ tăng trưởng ${c.trendRatio.toFixed(2)}x). Cần chuẩn bị nhập hàng để tránh đứt hàng.`;
      } else if (c.recommendationType === "SEASONAL_HOT") {
        typeReason = `Sản phẩm xu hướng mùa vụ (hệ số boost ${c.seasonBoost.toFixed(2)}x). Dự báo nhu cầu sẽ tăng nhanh.`;
      } else if (c.recommendationType === "CATEGORY_MOMENTUM") {
        typeReason = `Danh mục sản phẩm đang có tín hiệu tăng trưởng mạnh (tỷ lệ danh mục ${c.categoryTrendRatio.toFixed(2)}x).`;
      }

      return {
        sku: c.sku,
        recommendationType: c.recommendationType,
        currentStock: c.currentStock,
        minimumStock: c.minimumStock,
        soldLast7Days: c.soldLast7Days,
        soldLast30Days: c.soldLast30Days,
        trendRatio: Number(c.trendRatio.toFixed(2)),
        seasonBoost: Number(c.seasonBoost.toFixed(2)),
        stockCoverageDays: c.stockCoverageDays === 999 ? 999 : Number(c.stockCoverageDays.toFixed(1)),
        suggestedRestockQuantity: c.suggestedRestockQuantity,
        priority,
        confidence,
        reason: typeReason,
        detailAnalysis: {
          decision: `Đề xuất nhập thêm ${c.suggestedRestockQuantity} sản phẩm.`,
          mainReasons: [
            `Tồn kho hiện tại (${c.currentStock} sản phẩm) thấp hơn so với nhu cầu dự phòng dự kiến.`,
            `Lượng bán hàng 30 ngày qua ghi nhận ${c.soldLast30Days} sản phẩm.`,
            c.trendRatio > 1.05 
              ? "Tốc độ bán hàng gần đây có xu hướng tăng mạnh." 
              : c.trendRatio < 0.95 
                ? "Tốc độ bán hàng gần đây có xu hướng giảm nhẹ."
                : "Tốc độ bán hàng gần đây duy trì ổn định.",
            c.seasonBoost > 1 
              ? "Sản phẩm đang bước vào giai đoạn mùa vụ cao điểm." 
              : "Sản phẩm chưa ghi nhận biến động mùa vụ rõ nét.",
            `Nhu cầu dự phòng dự kiến trong ${days} ngày tới khoảng ${Math.ceil(c.expectedDemand)} sản phẩm.`
          ],
          risks: [
            `Nguy cơ đứt hàng và mất doanh thu nếu không nhập sớm.`,
            `Khả năng tồn đọng vốn nếu tốc độ bán giảm.`
          ],
          actionPlan: [
            `Liên hệ nhà cung cấp để chuẩn bị đơn hàng nhập ${c.suggestedRestockQuantity} sản phẩm.`,
            `Theo dõi tốc độ bán hàng tuần để điều chỉnh.`
          ]
        }
      };
    });

    const fallbackResponse = {
      overview: `Hệ thống tự động tính toán nhu cầu dự phòng cho ${days} ngày tới dựa trên doanh số và xu hướng. Phát hiện ${fallbackStats.recommended} sản phẩm cần nhập thêm, bao gồm ${fallbackStats.outOfStock} sản phẩm hết hàng, ${fallbackStats.lowStock} sản phẩm tồn kho thấp, ${fallbackStats.risingTrend} sản phẩm xu hướng tăng mạnh, và ${fallbackStats.seasonalHot} sản phẩm hot theo mùa.`,
      stats: fallbackStats,
      restockList: fallbackRestockList.slice(0, 40)
    };

    // Zod schema for AI validation
    const aiResponseSchema = z.object({
      overview: z.string(),
      stats: z.object({
        lowStock: z.number(),
        outOfStock: z.number(),
        recommended: z.number(),
        safe: z.number(),
        risingTrend: z.number(),
        seasonalHot: z.number(),
        seasonalWatch: z.number().default(0)
      }),
      restockList: z.array(z.object({
        sku: z.string(),
        recommendationType: z.enum(["LOW_STOCK", "RISING_TREND", "SEASONAL_HOT", "SEASONAL_WATCH", "NO_SIGNAL", "CATEGORY_MOMENTUM"]),
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
          actionPlan: z.array(z.string())
        })
      }))
    });

    let finalResult = fallbackResponse;

    if (process.env.GITHUB_TOKEN && topCandidates.length > 0) {
      try {
        const openai = new OpenAI({
          baseURL: "https://models.inference.ai.azure.com",
          apiKey: process.env.GITHUB_TOKEN,
        });

        const systemPrompt = "Bạn là chuyên gia quản trị chuỗi cung ứng cho cửa hàng bán lẻ đồ gia dụng. Hãy đưa ra đề xuất nhập hàng dựa trên dữ liệu bán hàng. YÊU CẦU QUAN TRỌNG: 1) Bạn phải phân tích và trả về ĐẦY ĐỦ tất cả các sản phẩm được liệt kê trong mảng `candidateProducts` đầu vào (không được lược bỏ bất kỳ sản phẩm nào). Mảng `restockList` trong JSON trả về phải có số lượng phần tử bằng đúng số lượng phần tử của `candidateProducts`. Phân loại `recommendationType` thành: `LOW_STOCK` (tồn thấp/hết hàng), `RISING_TREND` (xu hướng bán tăng), `SEASONAL_HOT` (hot mùa vụ và có bán thực tế), `SEASONAL_WATCH` (hợp mùa nhưng chưa đủ tín hiệu bán), `NO_SIGNAL` (chưa có tín hiệu rõ rệt). 2) Không được phép sử dụng các con số/thuật ngữ kỹ thuật thô như 'trendRatio', 'seasonBoost', 'avgDailySales', hoặc các con số dạng '1.25x', '0.85x' trong các mô tả của `decision`, `mainReasons`, `risks`, và `actionPlan` trong `detailAnalysis`. Hãy diễn đạt hoàn toàn bằng ngôn ngữ nghiệp vụ thủ kho dễ hiểu (ví dụ: 'Nhu cầu đang tăng mạnh so với tháng trước', 'Đang vào mùa vụ cao điểm', 'Tồn kho không đủ đáp ứng nhu cầu'). 3) Nếu sản phẩm có cả `soldLast7Days` và `soldLast30Days` đều bằng 0, bạn BẮT BUỘC phải trả về `suggestedRestockQuantity` bằng 0, `confidence` bằng 'LOW' và `priority` bằng 'LOW'. Chỉ trả về JSON hợp lệ, không bọc markdown.";
        
        const userPrompt = {
          days,
          candidateProducts: topCandidates.map(c => ({
            sku: c.sku,
            name: c.name,
            categoryName: c.categoryName,
            recommendationType: c.recommendationType,
            currentStock: c.currentStock,
            minimumStock: c.minimumStock,
            soldLast7Days: c.soldLast7Days,
            soldLast30Days: c.soldLast30Days,
            trendRatio: Number(c.trendRatio.toFixed(2)),
            categoryTrendRatio: Number(c.categoryTrendRatio.toFixed(2)),
            seasonBoost: Number(c.seasonBoost.toFixed(2)),
            stockCoverageDays: c.stockCoverageDays === 999 ? 999 : Number(c.stockCoverageDays.toFixed(1)),
            suggestedRestockQuantity: c.suggestedRestockQuantity
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
              seasonalWatch: "number"
            },
            restockList: [
              {
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
                  actionPlan: ["string"]
                }
              }
            ]
          }
        };

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPrompt) }
          ]
        });

        const rawJson = response.choices[0]?.message?.content || "{}";
        const cleanedJson = rawJson.trim()
          .replace(/^```json\\s*/i, "")
          .replace(/^```\\s*/i, "")
          .replace(/```$/i, "")
          .trim();

        const parsedAi = JSON.parse(cleanedJson);
        const validatedAi = aiResponseSchema.parse(parsedAi);

        // Validate that SKUs returned by AI are actually in the topCandidates list
        const filteredList = validatedAi.restockList.filter(item => 
          topCandidates.some(c => c.sku === item.sku)
        );

        if (filteredList.length > 0) {
          finalResult = {
            overview: validatedAi.overview,
            stats: validatedAi.stats,
            restockList: filteredList
          };
        }
      } catch (aiError) {
        console.error("AI service error in inventory forecast, falling back to math forecast:", aiError);
      }
    }

    // Enrich the final restock list with name, imageUrl, and seasonal details from forecastList
    const enrichedList = finalResult.restockList.map(item => {
      const matchedProd = forecastList.find(p => p.sku === item.sku);
      const seasonName = matchedProd?.seasonName || null;
      const seasonMonths = matchedProd?.seasonMonths || null;
      const seasonReason = matchedProd?.seasonReason || null;

      let recType = item.recommendationType;
      // Safeguard: SEASONAL_HOT requires seasonName and seasonReason. Otherwise, demote to RISING_TREND or CATEGORY_MOMENTUM
      if (recType === "SEASONAL_HOT" && (!seasonName || !seasonReason)) {
        recType = (matchedProd?.trendRatio && matchedProd.trendRatio >= 1.3) ? "RISING_TREND" : "CATEGORY_MOMENTUM";
      }

      return {
        ...item,
        recommendationType: recType,
        productId: matchedProd?.productId || 0,
        name: matchedProd?.name || "Sản phẩm không xác định",
        imageUrl: matchedProd?.imageUrl || "",
        seasonName,
        seasonMonths,
        seasonReason
      };
    });

    return res.json({
      success: true,
      message: "Phân tích kho hàng và đề xuất nhập hàng thành công.",
      data: {
        overview: finalResult.overview,
        stats: finalResult.stats,
        restockList: enrichedList
      }
    });
  })
);

// GET /api/inventory/transactions?page=1&limit=10&type=IMPORT&productId=1&search=&fromDate=2026-01-01&toDate=2026-12-31
router.get(
  "/transactions",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const type = String(req.query.type || "").trim().toUpperCase();
    const productId = getPositiveId(req.query.productId);
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");

    const where: Prisma.StockTransactionWhereInput = {};

    if (req.query.type) {
      const parsedType = stockTransactionTypeSchema.safeParse(type);

      if (!parsedType.success) {
        throw new AppError("Loại giao dịch kho không hợp lệ", 400);
      }

      where.type = parsedType.data;
    }

    if (req.query.productId && !productId) {
      throw new AppError("ID sản phẩm không hợp lệ", 400);
    }

    if (productId) {
      where.productId = productId;
    }

    if (search) {
      where.OR = [
        {
          note: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          product: {
            sku: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          product: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          user: {
            fullName: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    if (fromDate || toDate) {
      where.createdAt = {};

      if (fromDate) {
        where.createdAt.gte = fromDate;
      }

      if (toDate) {
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    const [transactions, totalItems] = await prisma.$transaction([
      prisma.stockTransaction.findMany({
        where,
        include: stockTransactionInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.stockTransaction.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy lịch sử giao dịch kho thành công",
      data: {
        items: transactions.map(formatStockTransaction),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
        },
      },
    });
  })
);

// POST /api/inventory/import
router.post(
  "/import",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);

    const stockData = validateParseResult(importStockSchema.safeParse(req.body));

    const { productId, quantity, note } = stockData;

    await checkActiveProduct(productId);

    const result = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: {
          id: productId,
        },
        data: {
          stockQuantity: {
            increment: quantity,
          },
        },
        include: lowStockProductInclude,
      });

      const stockTransaction = await tx.stockTransaction.create({
        data: {
          productId,
          userId,
          type: STOCK_TRANSACTION_TYPE.IMPORT,
          quantity,
          note: note || null,
        },
        include: stockTransactionInclude,
      });

      return {
        product: updatedProduct,
        transaction: stockTransaction,
      };
    });

    await createAuditLog({
      req: req as any,
      action: "STOCK_IN",
      entityType: "PRODUCT",
      entityId: productId,
      metadata: { quantity, note },
    });

    return res.status(201).json({
      success: true,
      message: "Nhập kho thành công",
      data: {
        product: formatLowStockProduct(result.product),
        transaction: formatStockTransaction(result.transaction),
      },
    });
  })
);

// POST /api/inventory/adjust
router.post(
  "/adjust",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);

    const stockData = validateParseResult(adjustStockSchema.safeParse(req.body));

    const { productId, newQuantity, note } = stockData;

    const existingProduct = await checkActiveProduct(productId);

    const difference = newQuantity - existingProduct.stockQuantity;

    if (difference === 0) {
      throw new AppError("Số lượng tồn mới không thay đổi", 400);
    }

    const finalNote =
      note ||
      `Điều chỉnh tồn kho từ ${existingProduct.stockQuantity} thành ${newQuantity}`;

    const result = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: {
          id: productId,
        },
        data: {
          stockQuantity: newQuantity,
        },
        include: lowStockProductInclude,
      });

      const stockTransaction = await tx.stockTransaction.create({
        data: {
          productId,
          userId,
          type: STOCK_TRANSACTION_TYPE.ADJUSTMENT,
          quantity: difference,
          note: finalNote,
        },
        include: stockTransactionInclude,
      });

      return {
        product: updatedProduct,
        transaction: stockTransaction,
      };
    });

    await createAuditLog({
      req: req as any,
      action: "STOCK_ADJUST",
      entityType: "PRODUCT",
      entityId: productId,
      metadata: { difference, newQuantity, note: finalNote },
    });

    return res.status(201).json({
      success: true,
      message: "Điều chỉnh tồn kho thành công",
      data: {
        product: formatLowStockProduct(result.product),
        transaction: formatStockTransaction(result.transaction),
      },
    });
  })
);

export default router;