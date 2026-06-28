import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import { enrichProductByBarcode } from "../services/barcode-enrichment.service";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";
import { USER_ROLES, RECORD_STATUS } from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { createAuditLog } from "../utils/audit";

const router = Router();

function normalizeProductPrice(value: Prisma.Decimal | number | string | null | undefined) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;

  return numberValue >= 10000 ? Math.round(numberValue / 1000) : numberValue;
}

const productInclude = {
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

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

const optionalDescriptionSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(500, "Mô tả không được vượt quá 500 ký tự")
    .optional()
);

const optionalQrCodeSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(100, "Mã QR không được vượt quá 100 ký tự")
    .optional()
);

const optionalImageUrlSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(500, "Đường dẫn hình ảnh không được vượt quá 500 ký tự")
    .optional()
);

const optionalBarcodeSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(100, "Mã vạch không được vượt quá 100 ký tự")
    .optional()
);

const optionalSkuSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(50, "SKU không được vượt quá 50 ký tự")
    .transform((value) => value.toUpperCase())
    .optional()
);

const baseProductSchema = z.object({
  sku: optionalSkuSchema,

  name: z
    .string()
    .trim()
    .min(1, "Tên sản phẩm không được để trống")
    .max(150, "Tên sản phẩm không được vượt quá 150 ký tự"),

  description: optionalDescriptionSchema,

  categoryId: z.coerce
    .number()
    .int("ID danh mục phải là số nguyên")
    .positive("ID danh mục không hợp lệ"),

  supplierId: z.coerce
    .number()
    .int("ID nhà cung cấp phải là số nguyên")
    .positive("ID nhà cung cấp không hợp lệ"),

  costPrice: z.coerce.number().min(0, "Giá nhập không được âm"),

  salePrice: z.coerce.number().positive("Giá bán phải lớn hơn 0"),

  originalPrice: z.coerce
    .number()
    .min(0, "Giá gốc không được âm")
    .optional(),

  stockQuantity: z.coerce
    .number()
    .int("Số lượng tồn phải là số nguyên")
    .min(0, "Số lượng tồn không được âm")
    .optional(),

  minStock: z.coerce
    .number()
    .int("Tồn kho tối thiểu phải là số nguyên")
    .min(0, "Tồn kho tối thiểu không được âm")
    .optional(),

  warrantyMonths: z.coerce
    .number()
    .int("Thời hạn bảo hành phải là số nguyên")
    .min(0, "Thời hạn bảo hành không được âm")
    .optional(),

  qrCode: optionalQrCodeSchema,

  imageUrl: optionalImageUrlSchema,

  barcode: optionalBarcodeSchema,
});

const createProductSchema = baseProductSchema.refine(
  (data) => data.salePrice >= data.costPrice,
  {
    message: "Giá bán phải lớn hơn hoặc bằng giá nhập",
    path: ["salePrice"],
  }
);

const updateProductSchema = baseProductSchema.refine(
  (data) => data.salePrice >= data.costPrice,
  {
    message: "Giá bán phải lớn hơn hoặc bằng giá nhập",
    path: ["salePrice"],
  }
);

function formatProduct(product: ProductWithRelations) {
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
    originalPrice: product.originalPrice ? normalizeProductPrice(product.originalPrice) : null,
    stockQuantity: product.stockQuantity,
    minStock: product.minStock,
    warrantyMonths: product.warrantyMonths,
    qrCode: product.qrCode,
    imageUrl: product.imageUrl,
    barcode: product.barcode,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

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

function getProductId(value: string) {
  const productId = Number(value);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new AppError("ID sản phẩm không hợp lệ", 400);
  }

  return productId;
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

async function checkCategoryAndSupplier(categoryId: number, supplierId: number) {
  const category = await prisma.category.findUnique({
    where: {
      id: categoryId,
    },
  });

  if (!category) {
    throw new AppError("Không tìm thấy danh mục", 404);
  }

  if (category.status !== RECORD_STATUS.ACTIVE) {
    throw new AppError("Danh mục đang ngừng hoạt động", 400);
  }

  const supplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
  });

  if (!supplier) {
    throw new AppError("Không tìm thấy nhà cung cấp", 404);
  }

  if (supplier.status !== RECORD_STATUS.ACTIVE) {
    throw new AppError("Nhà cung cấp đang ngừng hoạt động", 400);
  }
}

async function checkDuplicateSku(sku: string, ignoredProductId?: number) {
  const duplicateSku = await prisma.product.findFirst({
    where: {
      sku: {
        equals: sku,
        mode: "insensitive",
      },
      id: ignoredProductId
        ? {
            not: ignoredProductId,
          }
        : undefined,
    },
  });

  if (duplicateSku) {
    throw new AppError("SKU sản phẩm đã tồn tại", 409);
  }
}

async function checkDuplicateQrCode(qrCode: string, ignoredProductId?: number) {
  const duplicateQrCode = await prisma.product.findFirst({
    where: {
      qrCode: {
        equals: qrCode,
        mode: "insensitive",
      },
      id: ignoredProductId
        ? {
            not: ignoredProductId,
          }
        : undefined,
    },
  });

  if (duplicateQrCode) {
    throw new AppError("Mã QR sản phẩm đã tồn tại", 409);
  }
}

async function checkDuplicateBarcode(barcode: string, ignoredProductId?: number) {
  const duplicateBarcode = await prisma.product.findFirst({
    where: {
      barcode: {
        equals: barcode,
        mode: "insensitive",
      },
      id: ignoredProductId
        ? {
            not: ignoredProductId,
          }
        : undefined,
    },
  });

  if (duplicateBarcode) {
    throw new AppError("Mã vạch đã được sử dụng cho sản phẩm khác.", 409);
  }
}

function removeVietnameseTones(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function buildCodeFromText(value: string, fallback: string, maxLength = 6) {
  const normalized = removeVietnameseTones(value)
    .replace(/\bHomex\b/gi, "")
    .replace(/\b\d+([.,]\d+)?\s*(l|lit|kg|g|w|kw|cm|mm|m)\b/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) return fallback;

  const words = normalized
    .split(" ")
    .filter((word) => word.length > 1 && !/^\d+$/.test(word));

  const code = words.map((word) => word[0]).join("").toUpperCase();
  return (code || fallback).slice(0, maxLength);
}

async function buildCategoryCode(categoryId?: number) {
  if (!categoryId) return "PRD";

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });

  const bracketCode = category?.name.match(/\(([A-Z0-9]{2,8})\)/i)?.[1];
  if (bracketCode) return bracketCode.toUpperCase();

  return buildCodeFromText(category?.name || "", "PRD", 4);
}

async function generateProductSku(productName: string, categoryId?: number) {
  const categoryCode = await buildCategoryCode(categoryId);
  const productCode = buildCodeFromText(productName, "ITEM", 6);

  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const sku = `${categoryCode}-${productCode}-${String(sequence).padStart(4, "0")}`;
    const existed = await prisma.product.findUnique({ where: { sku } });
    if (!existed) return sku;
  }

  throw new AppError("Không thể tự sinh SKU duy nhất cho sản phẩm", 500);
}

// GET /api/products?page=1&limit=10&search=&status=ACTIVE&categoryId=1&supplierId=1&lowStock=true
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim().toUpperCase();
    const categoryId = getPositiveId(req.query.categoryId);
    const supplierId = getPositiveId(req.query.supplierId);
    const lowStock = String(req.query.lowStock || "").trim().toLowerCase();

    const where: Prisma.ProductWhereInput = {};

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
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          qrCode: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          barcode: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (
      req.query.status &&
      status !== RECORD_STATUS.ACTIVE &&
      status !== RECORD_STATUS.INACTIVE
    ) {
      throw new AppError("Trạng thái sản phẩm không hợp lệ", 400);
    }

    if (status === RECORD_STATUS.ACTIVE || status === RECORD_STATUS.INACTIVE) {
      where.status = status;
    }

    if (req.query.categoryId && !categoryId) {
      throw new AppError("ID danh mục không hợp lệ", 400);
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (req.query.supplierId && !supplierId) {
      throw new AppError("ID nhà cung cấp không hợp lệ", 400);
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (lowStock === "true") {
      where.stockQuantity = {
        lte: prisma.product.fields.minStock,
      };
    }

    const [products, totalItems] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: {
          createdAt: "desc",
        },
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
      message: "Lấy danh sách sản phẩm thành công",
      data: {
        items: products.map(formatProduct),
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

// GET /api/products/barcode/:code
router.get(
  "/barcode/:code",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const barcode = String(req.params.code || "").trim();

    if (!barcode) {
      throw new AppError("Mã barcode không hợp lệ", 400);
    }

    const product = await prisma.product.findFirst({
      where: {
        status: RECORD_STATUS.ACTIVE,
        OR: [
          {
            sku: {
              equals: barcode,
              mode: "insensitive",
            },
          },
          {
            qrCode: {
              equals: barcode,
              mode: "insensitive",
            },
          },
        ],
      },
      include: productInclude,
    });

    if (!product) {
      throw new AppError("Không tìm thấy sản phẩm theo barcode", 404);
    }

    return res.json({
      success: true,
      message: "Tìm sản phẩm theo barcode thành công",
      data: formatProduct(product),
    });
  })
);

// GET /api/products/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const productId = getProductId(String(req.params.id));

    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: productInclude,
    });

    if (!product) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết sản phẩm thành công",
      data: formatProduct(product),
    });
  })
);

// POST /api/products
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const productData = validateParseResult(
      createProductSchema.safeParse(req.body)
    );

    const {
      sku,
      name,
      description,
      categoryId,
      supplierId,
      costPrice,
      salePrice,
      originalPrice,
      stockQuantity,
      minStock,
      warrantyMonths,
      qrCode,
      imageUrl,
      barcode,
    } = productData;

    await checkCategoryAndSupplier(categoryId, supplierId);
    const finalSku = sku || await generateProductSku(name, categoryId);
    await checkDuplicateSku(finalSku);

    const finalQrCode = qrCode || finalSku;
    const finalCostPrice = normalizeProductPrice(costPrice);
    const finalSalePrice = normalizeProductPrice(salePrice);
    const finalOriginalPrice = originalPrice ? normalizeProductPrice(originalPrice) : null;

    await checkDuplicateQrCode(finalQrCode);

    const finalBarcode = barcode ? barcode.trim() : null;
    if (finalBarcode) {
      await checkDuplicateBarcode(finalBarcode);
    }

    const product = await prisma.product.create({
      data: {
        sku: finalSku,
        name,
        description: description || null,
        categoryId,
        supplierId,
        costPrice: finalCostPrice,
        salePrice: finalSalePrice,
        originalPrice: finalOriginalPrice,
        stockQuantity: stockQuantity ?? 0,
        minStock: minStock ?? 0,
        warrantyMonths: warrantyMonths ?? 0,
        qrCode: finalQrCode,
        imageUrl: imageUrl || null,
        barcode: finalBarcode,
        status: RECORD_STATUS.ACTIVE,
      },
      include: productInclude,
    });

    await createAuditLog({
      req: req as any,
      action: "CREATE",
      entityType: "PRODUCT",
      entityId: product.id,
      metadata: { sku: product.sku, name: product.name, salePrice: product.salePrice },
    });

    return res.status(201).json({
      success: true,
      message: "Thêm sản phẩm thành công",
      data: formatProduct(product),
    });
  })
);

// PUT /api/products/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const productId = getProductId(String(req.params.id));

    const productData = validateParseResult(
      updateProductSchema.safeParse(req.body)
    );

    const existingProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!existingProduct) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }

    const {
      sku,
      name,
      description,
      categoryId,
      supplierId,
      costPrice,
      salePrice,
      originalPrice,
      stockQuantity,
      minStock,
      warrantyMonths,
      qrCode,
      imageUrl,
      barcode,
    } = productData;

    await checkCategoryAndSupplier(categoryId, supplierId);
    const finalSku = existingProduct.sku;

    const finalQrCode = qrCode || finalSku;
    const finalCostPrice = normalizeProductPrice(costPrice);
    const finalSalePrice = normalizeProductPrice(salePrice);
    const finalOriginalPrice = originalPrice ? normalizeProductPrice(originalPrice) : null;

    await checkDuplicateQrCode(finalQrCode, productId);

    const finalBarcode = barcode ? barcode.trim() : null;
    if (finalBarcode) {
      await checkDuplicateBarcode(finalBarcode, productId);
    }

    const updatedProduct = await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        sku: finalSku,
        name,
        description: description || null,
        categoryId,
        supplierId,
        costPrice: finalCostPrice,
        salePrice: finalSalePrice,
        originalPrice: finalOriginalPrice,
        stockQuantity: stockQuantity ?? existingProduct.stockQuantity,
        minStock: minStock ?? existingProduct.minStock,
        warrantyMonths: warrantyMonths ?? existingProduct.warrantyMonths,
        qrCode: finalQrCode,
        imageUrl: imageUrl || null,
        barcode: finalBarcode,
      },
      include: productInclude,
    });

    await createAuditLog({
      req: req as any,
      action: "UPDATE",
      entityType: "PRODUCT",
      entityId: updatedProduct.id,
      metadata: { sku: updatedProduct.sku, name: updatedProduct.name },
    });

    return res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data: formatProduct(updatedProduct),
    });
  })
);


// DELETE /api/products/:id/hard
router.delete(
  "/:id/hard",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const productId = getProductId(String(req.params.id));
    const adminPassword = String(req.body?.adminPassword || "");

    if (adminPassword !== "Admin@123") {
      throw new AppError("Mật khẩu xác nhận không đúng", 400);
    }

    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existingProduct) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    await createAuditLog({
      req: req as any,
      action: "HARD_DELETE",
      entityType: "PRODUCT",
      entityId: productId,
      metadata: { sku: existingProduct.sku, name: existingProduct.name },
    });

    return res.json({
      success: true,
      message: "Xóa vĩnh viễn sản phẩm thành công",
      data: { id: productId },
    });
  })
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const productId = getProductId(String(req.params.id));

    const existingProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!existingProduct) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }

    if (existingProduct.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("Sản phẩm đã ngừng hoạt động trước đó", 400);
    }

    const deletedProduct = await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        status: RECORD_STATUS.INACTIVE,
      },
      include: productInclude,
    });

    await createAuditLog({
      req: req as any,
      action: "DELETE",
      entityType: "PRODUCT",
      entityId: deletedProduct.id,
      metadata: { sku: deletedProduct.sku, name: deletedProduct.name },
    });

    return res.json({
      success: true,
      message: "Xóa sản phẩm thành công",
      data: formatProduct(deletedProduct),
    });
  })
);

// PATCH /api/products/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const productId = getProductId(String(req.params.id));

    const existingProduct = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: productInclude,
    });

    if (!existingProduct) {
      throw new AppError("Không tìm thấy sản phẩm", 404);
    }

    if (existingProduct.status === RECORD_STATUS.ACTIVE) {
      throw new AppError("Sản phẩm đang hoạt động", 400);
    }

    if (existingProduct.category.status !== RECORD_STATUS.ACTIVE) {
      throw new AppError(
        "Không thể khôi phục sản phẩm vì danh mục đang ngừng hoạt động",
        400
      );
    }

    if (existingProduct.supplier.status !== RECORD_STATUS.ACTIVE) {
      throw new AppError(
        "Không thể khôi phục sản phẩm vì nhà cung cấp đang ngừng hoạt động",
        400
      );
    }

    const restoredProduct = await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        status: RECORD_STATUS.ACTIVE,
      },
      include: productInclude,
    });

    await createAuditLog({
      req: req as any,
      action: "RESTORE",
      entityType: "PRODUCT",
      entityId: restoredProduct.id,
      metadata: { sku: restoredProduct.sku, name: restoredProduct.name },
    });

    return res.json({
      success: true,
      message: "Khôi phục sản phẩm thành công",
      data: formatProduct(restoredProduct),
    });
  })
);

// GET /api/products/barcode/:barcode
router.get(
  "/barcode/:barcode",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const barcode = String(req.params.barcode || "").trim();
    if (!barcode) {
      throw new AppError("Mã vạch không hợp lệ", 400);
    }

    const product = await prisma.product.findFirst({
      where: {
        barcode: {
          equals: barcode,
          mode: "insensitive",
        },
        status: RECORD_STATUS.ACTIVE,
      },
      include: productInclude,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm với mã vạch này.",
      });
    }

    return res.json({
      success: true,
      message: "Tìm thấy sản phẩm.",
      data: formatProduct(product),
    });
  })
);

// POST /api/products/enrich
router.post(
  "/enrich",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const { barcode } = req.body;
    if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
      throw new AppError("Vui lòng cung cấp mã vạch hợp lệ", 400);
    }

    const cleanBarcode = barcode.trim();
    const result = await enrichProductByBarcode(cleanBarcode);

    if (!result.data) {
      return res.json({
        success: true,
        message: "Không tìm thấy dữ liệu mã vạch. Vui lòng nhập thủ công.",
        data: {
          barcode: cleanBarcode,
          source: "HYBRID",
          missingFields: ["name", "category", "estimatedSalePrice", "imageUrlOrDescription"],
        },
      });
    }

    const message = result.foundInDatabase
      ? "Tìm thấy sản phẩm trong hệ thống."
      : result.data.source === "HYBRID"
        ? "Đã tra cứu barcode và AI đã bù thông tin còn thiếu."
        : result.data.source === "AI"
          ? "AI đã gợi ý thông tin sản phẩm."
          : "Đã tìm thấy thông tin từ dữ liệu mã vạch.";

    return res.json({
      success: true,
      message,
      data: result.data,
    });
  })
);
export default router;



