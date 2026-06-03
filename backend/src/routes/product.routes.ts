import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
    authenticateToken,
    authorizeRoles,
} from "../middlewares/auth.middleware";

const router = Router();

const productStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

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

  costPrice: z.coerce
      .number()
      .min(0, "Giá nhập không được âm"),

  salePrice: z.coerce
      .number()
      .positive("Giá bán phải lớn hơn 0"),

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

function getProductInclude() {
  return {
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
  };
}

function formatProduct(product: any) {
  return {
    ...product,
    costPrice: Number(product.costPrice),
    salePrice: Number(product.salePrice),
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

async function checkCategoryAndSupplier(categoryId: number, supplierId: number) {
  const category = await prisma.category.findUnique({
    where: {
      id: categoryId,
    },
  });

  if (!category) {
    return {
      success: false,
      statusCode: 404,
      message: "Không tìm thấy danh mục",
    };
  }

  if (category.status !== "ACTIVE") {
    return {
      success: false,
      statusCode: 400,
      message: "Danh mục đang ngừng hoạt động",
    };
  }

  const supplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
  });

  if (!supplier) {
    return {
      success: false,
      statusCode: 404,
      message: "Không tìm thấy nhà cung cấp",
    };
  }

  if (supplier.status !== "ACTIVE") {
    return {
      success: false,
      statusCode: 400,
      message: "Nhà cung cấp đang ngừng hoạt động",
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: "Danh mục và nhà cung cấp hợp lệ",
  };
}

// GET /api/products?page=1&limit=10&search=&status=ACTIVE&categoryId=1&supplierId=1&lowStock=true
router.get(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
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

      if (req.query.status && status !== "ACTIVE" && status !== "INACTIVE") {
        return res.status(400).json({
          success: false,
          message: "Trạng thái sản phẩm không hợp lệ",
        });
      }

      if (status === "ACTIVE" || status === "INACTIVE") {
        where.status = status;
      }

      if (req.query.categoryId && !categoryId) {
        return res.status(400).json({
          success: false,
          message: "ID danh mục không hợp lệ",
        });
      }

      if (categoryId) {
        where.categoryId = categoryId;
      }

      if (req.query.supplierId && !supplierId) {
        return res.status(400).json({
          success: false,
          message: "ID nhà cung cấp không hợp lệ",
        });
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
          include: getProductInclude(),
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
    } catch (error) {
      console.error("Lỗi lấy danh sách sản phẩm:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy danh sách sản phẩm",
      });
    }
  }
);

// GET /api/products/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const productId = Number(req.params.id);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID sản phẩm không hợp lệ",
        });
      }

      const product = await prisma.product.findUnique({
        where: {
          id: productId,
        },
        include: getProductInclude(),
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }

      return res.json({
        success: true,
        message: "Lấy chi tiết sản phẩm thành công",
        data: formatProduct(product),
      });
    } catch (error) {
      console.error("Lỗi lấy chi tiết sản phẩm:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy chi tiết sản phẩm",
      });
    }
  }
);

// POST /api/products
router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const result = createProductSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
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
      } = result.data;

      const relationCheck = await checkCategoryAndSupplier(categoryId, supplierId);

      if (!relationCheck.success) {
        return res.status(relationCheck.statusCode).json({
          success: false,
          message: relationCheck.message,
        });
      }

      const existingSku = await prisma.product.findFirst({
        where: {
          sku: {
            equals: sku,
            mode: "insensitive",
          },
        },
      });

      if (existingSku) {
        return res.status(409).json({
          success: false,
          message: "SKU sản phẩm đã tồn tại",
        });
      }

      const finalQrCode = qrCode || sku;

      const existingQrCode = await prisma.product.findFirst({
        where: {
          qrCode: {
            equals: finalQrCode,
            mode: "insensitive",
          },
        },
      });

      if (existingQrCode) {
        return res.status(409).json({
          success: false,
          message: "Mã QR sản phẩm đã tồn tại",
        });
      }

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
          status: "ACTIVE",
        },
        include: getProductInclude(),
      });

      return res.status(201).json({
        success: true,
        message: "Thêm sản phẩm thành công",
        data: formatProduct(product),
      });
    } catch (error) {
      console.error("Lỗi thêm sản phẩm:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi server khi thêm sản phẩm",
      });
    }
  }
);

// PUT /api/products/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const productId = Number(req.params.id);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID sản phẩm không hợp lệ",
        });
      }

      const result = updateProductSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const existingProduct = await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
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
      } = result.data;

      const relationCheck = await checkCategoryAndSupplier(categoryId, supplierId);

      if (!relationCheck.success) {
        return res.status(relationCheck.statusCode).json({
          success: false,
          message: relationCheck.message,
        });
      }

      const duplicateSku = await prisma.product.findFirst({
        where: {
          sku: {
            equals: sku,
            mode: "insensitive",
          },
          id: {
            not: productId,
          },
        },
      });

      if (duplicateSku) {
        return res.status(409).json({
          success: false,
          message: "SKU sản phẩm đã tồn tại",
        });
      }

      const finalQrCode = qrCode || sku;

      const duplicateQrCode = await prisma.product.findFirst({
        where: {
          qrCode: {
            equals: finalQrCode,
            mode: "insensitive",
          },
          id: {
            not: productId,
          },
        },
      });

      if (duplicateQrCode) {
        return res.status(409).json({
          success: false,
          message: "Mã QR sản phẩm đã tồn tại",
        });
      }

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
        include: getProductInclude(),
      });

      return res.json({
        success: true,
        message: "Cập nhật sản phẩm thành công",
        data: formatProduct(updatedProduct),
      });
    } catch (error) {
      console.error("Lỗi cập nhật sản phẩm:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi server khi cập nhật sản phẩm",
      });
    }
  }
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "MANAGER"),
  async (req, res) => {
    try {
      const productId = Number(req.params.id);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID sản phẩm không hợp lệ",
        });
      }

      const existingProduct = await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }

      if (existingProduct.status === "INACTIVE") {
        return res.status(400).json({
          success: false,
          message: "Sản phẩm đã ngừng hoạt động trước đó",
        });
      }

      const deletedProduct = await prisma.product.update({
        where: {
          id: productId,
        },
        data: {
          status: "INACTIVE",
        },
        include: getProductInclude(),
      });

      return res.json({
        success: true,
        message: "Xóa sản phẩm thành công",
        data: formatProduct(deletedProduct),
      });
    } catch (error) {
      console.error("Lỗi xóa sản phẩm:", error);

      return res.status(500).json({
        success: false,
        message: "Lỗi server khi xóa sản phẩm",
      });
    }
  }
);

export default router;