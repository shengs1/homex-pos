import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";
import { USER_ROLES, RECORD_STATUS } from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

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

const productStatusSchema = z.enum([
  RECORD_STATUS.ACTIVE,
  RECORD_STATUS.INACTIVE,
]);

const baseProductSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU không được để trống")
    .max(50, "SKU không được vượt quá 50 ký tự")
    .transform((value) => value.toUpperCase()),

  name: z
    .string()
    .trim()
    .min(1, "Tên sản phẩm không được để trống")
    .max(150, "Tên sản phẩm không được vượt quá 150 ký tự"),

  description: z
    .string()
    .trim()
    .max(500, "Mô tả không được vượt quá 500 ký tự")
    .optional(),

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

  qrCode: z
    .string()
    .trim()
    .max(100, "Mã QR không được vượt quá 100 ký tự")
    .optional(),

  imageUrl: z
    .string()
    .trim()
    .max(500, "Đường dẫn hình ảnh không được vượt quá 500 ký tự")
    .optional(),
});

const createProductSchema = baseProductSchema.refine(
  (data) => data.salePrice >= data.costPrice,
  {
    message: "Giá bán phải lớn hơn hoặc bằng giá nhập",
    path: ["salePrice"],
  }
);

const updateProductSchema = baseProductSchema
  .extend({
    status: productStatusSchema,
  })
  .refine((data) => data.salePrice >= data.costPrice, {
    message: "Giá bán phải lớn hơn hoặc bằng giá nhập",
    path: ["salePrice"],
  });

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
    costPrice: Number(product.costPrice),
    salePrice: Number(product.salePrice),
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

// GET /api/products?page=1&limit=10&search=&status=ACTIVE&categoryId=1&supplierId=1&lowStock=true
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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

// PATCH /api/products/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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

    return res.json({
      success: true,
      message: "Khôi phục sản phẩm thành công",
      data: formatProduct(restoredProduct),
    });
  })
);

// GET /api/products/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const productData = validateParseResult(createProductSchema.safeParse(req.body));

    const {
      sku,
      name,
      description,
      categoryId,
      supplierId,
      costPrice,
      salePrice,
      stockQuantity,
      minStock,
      warrantyMonths,
      qrCode,
      imageUrl,
    } = productData;

    await checkCategoryAndSupplier(categoryId, supplierId);
    await checkDuplicateSku(sku);

    const finalQrCode = qrCode || sku;
    await checkDuplicateQrCode(finalQrCode);

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        description: description || null,
        categoryId,
        supplierId,
        costPrice,
        salePrice,
        stockQuantity: stockQuantity ?? 0,
        minStock: minStock ?? 0,
        warrantyMonths: warrantyMonths ?? 0,
        qrCode: finalQrCode,
        imageUrl: imageUrl || null,
        status: RECORD_STATUS.ACTIVE,
      },
      include: productInclude,
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
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const productId = getProductId(String(req.params.id));
    const productData = validateParseResult(updateProductSchema.safeParse(req.body));

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
      stockQuantity,
      minStock,
      warrantyMonths,
      qrCode,
      imageUrl,
      status,
    } = productData;

    await checkCategoryAndSupplier(categoryId, supplierId);
    await checkDuplicateSku(sku, productId);

    const finalQrCode = qrCode || sku;
    await checkDuplicateQrCode(finalQrCode, productId);

    const updatedProduct = await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        sku,
        name,
        description: description || null,
        categoryId,
        supplierId,
        costPrice,
        salePrice,
        stockQuantity,
        minStock,
        warrantyMonths,
        qrCode: finalQrCode,
        imageUrl: imageUrl || null,
        status,
      },
      include: productInclude,
    });

    return res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      data: formatProduct(updatedProduct),
    });
  })
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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

    return res.json({
      success: true,
      message: "Xóa sản phẩm thành công",
      data: formatProduct(deletedProduct),
    });
  })
);

export default router;