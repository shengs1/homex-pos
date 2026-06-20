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

const customerStatusSchema = z.enum([
  RECORD_STATUS.ACTIVE,
  RECORD_STATUS.INACTIVE,
]);

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

const createCustomerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Tên khách hàng không được để trống")
    .max(100, "Tên khách hàng không được vượt quá 100 ký tự"),

  phone: z
    .string()
    .trim()
    .min(1, "Số điện thoại không được để trống")
    .max(20, "Số điện thoại không được vượt quá 20 ký tự")
    .regex(/^[0-9]+$/, "Số điện thoại chỉ được chứa chữ số"),

  email: optionalEmailSchema,

  address: optionalAddressSchema,
});

const updateCustomerSchema = createCustomerSchema.extend({
  points: z
    .number()
    .int("Điểm tích lũy phải là số nguyên")
    .min(0, "Điểm tích lũy không được nhỏ hơn 0")
    .optional(),
});

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getCustomerId(value: string) {
  const customerId = Number(value);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new AppError("ID khách hàng không hợp lệ", 400);
  }

  return customerId;
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

async function checkDuplicateCustomerPhone(
  phone: string,
  ignoredCustomerId?: number
) {
  const duplicateCustomer = await prisma.customer.findFirst({
    where: {
      phone,
      id: ignoredCustomerId
        ? {
            not: ignoredCustomerId,
          }
        : undefined,
    },
  });

  if (duplicateCustomer) {
    throw new AppError("Số điện thoại khách hàng đã tồn tại", 409);
  }
}

function getCustomerTier(points: number) {
  if (points >= 2000) return "DIAMOND";
  if (points >= 500) return "GOLD";
  return "SILVER";
}

// GET /api/customers?page=1&limit=10&search=&status=ACTIVE
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

    const where: Prisma.CustomerWhereInput = {};

    if (search) {
      where.OR = [
        {
          fullName: {
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
      ];
    }

    if (
      req.query.status &&
      status !== RECORD_STATUS.ACTIVE &&
      status !== RECORD_STATUS.INACTIVE
    ) {
      throw new AppError("Trạng thái khách hàng không hợp lệ", 400);
    }

    if (status === RECORD_STATUS.ACTIVE || status === RECORD_STATUS.INACTIVE) {
      where.status = status;
    }

    const [customers, totalItems] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.customer.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách khách hàng thành công",
      data: {
        items: customers,
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

// GET /api/customers/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const customerId = getCustomerId(String(req.params.id));

    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      throw new AppError("Không tìm thấy khách hàng", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết khách hàng thành công",
      data: customer,
    });
  })
);

// POST /api/customers
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const customerData = validateParseResult(
      createCustomerSchema.safeParse(req.body)
    );

    const { fullName, phone, email, address } = customerData;

    await checkDuplicateCustomerPhone(phone);

    const customer = await prisma.customer.create({
      data: {
        fullName,
        phone,
        email: email || null,
        address: address || null,
        points: 0,
        tier: getCustomerTier(0),
        status: RECORD_STATUS.ACTIVE,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Thêm khách hàng thành công",
      data: customer,
    });
  })
);

// PUT /api/customers/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const customerId = getCustomerId(String(req.params.id));

    const customerData = validateParseResult(
      updateCustomerSchema.safeParse(req.body)
    );

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!existingCustomer) {
      throw new AppError("Không tìm thấy khách hàng", 404);
    }

    const { fullName, phone, email, address, points } = customerData;

    await checkDuplicateCustomerPhone(phone, customerId);

    const updatedCustomer = await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        fullName,
        phone,
        email: email || null,
        address: address || null,
        points,
        tier: points === undefined ? existingCustomer.tier : getCustomerTier(points),
      },
    });

    return res.json({
      success: true,
      message: "Cập nhật khách hàng thành công",
      data: updatedCustomer,
    });
  })
);

// DELETE /api/customers/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const customerId = getCustomerId(String(req.params.id));

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!existingCustomer) {
      throw new AppError("Không tìm thấy khách hàng", 404);
    }

    if (existingCustomer.status === RECORD_STATUS.INACTIVE) {
      throw new AppError("Khách hàng đã ngừng hoạt động trước đó", 400);
    }

    const deletedCustomer = await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        status: RECORD_STATUS.INACTIVE,
      },
    });

    return res.json({
      success: true,
      message: "Xóa khách hàng thành công",
      data: deletedCustomer,
    });
  })
);

// PATCH /api/customers/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const customerId = getCustomerId(String(req.params.id));

    const existingCustomer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!existingCustomer) {
      throw new AppError("Không tìm thấy khách hàng", 404);
    }

    if (existingCustomer.status === RECORD_STATUS.ACTIVE) {
      throw new AppError("Khách hàng đang hoạt động", 400);
    }

    const restoredCustomer = await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        status: RECORD_STATUS.ACTIVE,
      },
    });

    return res.json({
      success: true,
      message: "Khôi phục khách hàng thành công",
      data: restoredCustomer,
    });
  })
);

export default router;
