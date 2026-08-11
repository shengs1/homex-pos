import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { inventoryAiService } from "../services/inventory-ai.service";
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
    const days = Math.max(1, Number(req.query.days || 15));
    const language = req.query.language === "en" ? "en" : "vi";
    const result = await inventoryAiService.forecast(days, language);

    return res.json({
      success: true,
      message: "Phân tích kho hàng và đề xuất nhập hàng thành công.",
      data: result,
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