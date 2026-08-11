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
import { createAuditLog } from "../utils/audit";

const router = Router();

const optionalEmailSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .email("Email không hợp lệ")
    .max(100, "Email không được vượt quá 100 ký tự")
    .optional()
);

const optionalAddressSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(255, "Địa chỉ không được vượt quá 255 ký tự")
    .optional()
);

const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tên nhà cung cấp không được để trống")
    .max(100, "Tên nhà cung cấp không được vượt quá 100 ký tự"),

  phone: z
    .string()
    .trim()
    .min(1, "Số điện thoại không được để trống")
    .max(20, "Số điện thoại không được vượt quá 20 ký tự")
    .regex(/^[0-9]+$/, "Số điện thoại chỉ được chứa chữ số"),

  email: optionalEmailSchema,

  taxCode: z.string().trim().max(20, "Mã số thuế không được vượt quá 20 ký tự").optional().or(z.literal("")),

  address: optionalAddressSchema,
});

const updateSupplierSchema = createSupplierSchema;

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getSupplierId(value: string) {
  const supplierId = Number(value);

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new AppError("ID nhà cung cấp không hợp lệ", 400);
  }

  return supplierId;
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

async function checkDuplicateSupplierPhone(
  phone: string,
  ignoredSupplierId?: number
) {
  const duplicateSupplier = await prisma.supplier.findFirst({
    where: {
      phone,
      id: ignoredSupplierId
        ? {
            not: ignoredSupplierId,
          }
        : undefined,
    },
  });

  if (duplicateSupplier) {
    throw new AppError("Số điện thoại nhà cung cấp đã tồn tại", 409);
  }
}

async function checkDuplicateSupplierEmail(
  email?: string,
  ignoredSupplierId?: number
) {
  if (!email) {
    return;
  }

  const duplicateSupplier = await prisma.supplier.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      id: ignoredSupplierId
        ? {
            not: ignoredSupplierId,
          }
        : undefined,
    },
  });

  if (duplicateSupplier) {
    throw new AppError("Email nhà cung cấp đã tồn tại", 409);
  }
}

// GET /api/suppliers?page=1&limit=10&search=&status=ACTIVE
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

    const where: Prisma.SupplierWhereInput = {};

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          address: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (req.query.status) {
      if (status !== RECORD_STATUS.ACTIVE && status !== RECORD_STATUS.INACTIVE) {
        throw new AppError("Trạng thái nhà cung cấp không hợp lệ", 400);
      }

      where.status = status;
    }

    const [suppliers, totalItems] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.supplier.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách nhà cung cấp thành công",
      data: {
        items: suppliers,
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

// GET /api/suppliers/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const supplierId = getSupplierId(String(req.params.id));

    const supplier = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!supplier) {
      throw new AppError("Không tìm thấy nhà cung cấp", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết nhà cung cấp thành công",
      data: supplier,
    });
  })
);

// POST /api/suppliers
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const supplierData = validateParseResult(
      createSupplierSchema.safeParse(req.body)
    );

    const { name, phone, email, taxCode, address } = supplierData;

    await checkDuplicateSupplierPhone(phone);
    await checkDuplicateSupplierEmail(email);

    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone,
        email: email || null,
        taxCode: taxCode || null,
        address: address || null,
        status: RECORD_STATUS.ACTIVE,
      },
    });

    await createAuditLog({
      req: req as any,
      action: "CREATE",
      entityType: "SUPPLIER",
      entityId: supplier.id,
      metadata: { name: supplier.name, phone: supplier.phone },
    });

    return res.status(201).json({
      success: true,
      message: "Thêm nhà cung cấp thành công",
      data: supplier,
    });
  })
);

// PUT /api/suppliers/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const supplierId = getSupplierId(String(req.params.id));

    const supplierData = validateParseResult(
      updateSupplierSchema.safeParse(req.body)
    );

    const existingSupplier = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!existingSupplier) {
      throw new AppError("Không tìm thấy nhà cung cấp", 404);
    }

    const { name, phone, email, taxCode, address } = supplierData;

    await checkDuplicateSupplierPhone(phone, supplierId);
    await checkDuplicateSupplierEmail(email, supplierId);

    const updatedSupplier = await prisma.supplier.update({
      where: {
        id: supplierId,
      },
      data: {
        name,
        phone,
        email: email || null,
        taxCode: taxCode || null,
        address: address || null,
      },
    });

    await createAuditLog({
      req: req as any,
      action: "UPDATE",
      entityType: "SUPPLIER",
      entityId: updatedSupplier.id,
      metadata: { name: updatedSupplier.name, phone: updatedSupplier.phone },
    });

    return res.json({
      success: true,
      message: "Cập nhật nhà cung cấp thành công",
      data: updatedSupplier,
    });
  })
);

// DELETE /api/suppliers/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const supplierId = getSupplierId(String(req.params.id));

    const existingSupplier = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!existingSupplier) {
      throw new AppError("Không tìm thấy nhà cung cấp", 404);
    }

    if (existingSupplier.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("Nhà cung cấp đã ngừng hoạt động trước đó", 400);
    }

    const deletedSupplier = await prisma.supplier.update({
      where: {
        id: supplierId,
      },
      data: {
        status: RECORD_STATUS.INACTIVE,
      },
    });

    await createAuditLog({
      req: req as any,
      action: "DELETE",
      entityType: "SUPPLIER",
      entityId: deletedSupplier.id,
      metadata: { name: deletedSupplier.name },
    });

    return res.json({
      success: true,
      message: "Xóa nhà cung cấp thành công",
      data: deletedSupplier,
    });
  })
);

// PATCH /api/suppliers/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const supplierId = getSupplierId(String(req.params.id));

    const existingSupplier = await prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!existingSupplier) {
      throw new AppError("Không tìm thấy nhà cung cấp", 404);
    }

    if (existingSupplier.status === RECORD_STATUS.ACTIVE) {
      throw new AppError("Nhà cung cấp đang hoạt động", 400);
    }

    const restoredSupplier = await prisma.supplier.update({
      where: {
        id: supplierId,
      },
      data: {
        status: RECORD_STATUS.ACTIVE,
      },
    });

    await createAuditLog({
      req: req as any,
      action: "RESTORE",
      entityType: "SUPPLIER",
      entityId: restoredSupplier.id,
      metadata: { name: restoredSupplier.name },
    });

    return res.json({
      success: true,
      message: "Khôi phục nhà cung cấp thành công",
      data: restoredSupplier,
    });
  })
);

export default router;