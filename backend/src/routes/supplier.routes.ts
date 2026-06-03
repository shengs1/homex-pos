import { Router } from "express";
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

const supplierStatusSchema = z.enum([
  RECORD_STATUS.ACTIVE,
  RECORD_STATUS.INACTIVE,
]);

const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Tên nhà cung cấp không được để trống")
    .max(100, "Tên nhà cung cấp không được vượt quá 100 ký tự"),

  phone: z
    .string()
    .trim()
    .max(20, "Số điện thoại không được vượt quá 20 ký tự")
    .optional(),

  address: z
    .string()
    .trim()
    .max(255, "Địa chỉ không được vượt quá 255 ký tự")
    .optional(),
});

const updateSupplierSchema = createSupplierSchema.extend({
  status: supplierStatusSchema,
});

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

async function checkDuplicateSupplierName(name: string, ignoredSupplierId?: number) {
  const duplicateSupplier = await prisma.supplier.findFirst({
    where: {
      name: {
        equals: name,
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
    throw new AppError("Tên nhà cung cấp đã tồn tại", 409);
  }
}

// GET /api/suppliers
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      success: true,
      message: "Lấy danh sách nhà cung cấp thành công",
      data: suppliers,
    });
  })
);

// POST /api/suppliers
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
  catchAsync(async (req, res) => {
    const supplierData = validateParseResult(
      createSupplierSchema.safeParse(req.body)
    );

    const { name, phone, address } = supplierData;

    await checkDuplicateSupplierName(name);

    const supplier = await prisma.supplier.create({
      data: {
        name,
        phone: phone || null,
        address: address || null,
        status: RECORD_STATUS.ACTIVE,
      },
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
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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

    const { name, phone, address, status } = supplierData;

    await checkDuplicateSupplierName(name, supplierId);

    const updatedSupplier = await prisma.supplier.update({
      where: {
        id: supplierId,
      },
      data: {
        name,
        phone: phone || null,
        address: address || null,
        status,
      },
    });

    return res.json({
      success: true,
      message: "Cập nhật nhà cung cấp thành công",
      data: updatedSupplier,
    });
  })
);

// PATCH /api/suppliers/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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

    return res.json({
      success: true,
      message: "Khôi phục nhà cung cấp thành công",
      data: restoredSupplier,
    });
  })
);

// DELETE /api/suppliers/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
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

    return res.json({
      success: true,
      message: "Xóa nhà cung cấp thành công",
      data: deletedSupplier,
    });
  })
);

export default router;