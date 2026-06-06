import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";
import {
  USER_ROLES,
  RECORD_STATUS,
  ORDER_STATUS,
  WARRANTY_STATUS,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

const warrantyInclude = {
  customer: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      address: true,
      points: true,
      status: true,
    },
  },
  orderDetail: {
    include: {
      order: {
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          status: true,
          createdAt: true,
        },
      },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          salePrice: true,
          warrantyMonths: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.WarrantyInclude;

type WarrantyWithRelations = Prisma.WarrantyGetPayload<{
  include: typeof warrantyInclude;
}>;

const warrantyStatusSchema = z.enum([
  WARRANTY_STATUS.ACTIVE,
  WARRANTY_STATUS.EXPIRED,
  WARRANTY_STATUS.CANCELLED,
]);

const createWarrantySchema = z.object({
  orderDetailId: z.coerce
    .number()
    .int("ID chi tiết đơn hàng phải là số nguyên")
    .positive("ID chi tiết đơn hàng không hợp lệ"),

  startDate: z
    .string()
    .trim()
    .optional(),
});

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getWarrantyId(value: string) {
  const warrantyId = Number(value);

  if (!Number.isInteger(warrantyId) || warrantyId <= 0) {
    throw new AppError("ID bảo hành không hợp lệ", 400);
  }

  return warrantyId;
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

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function generateWarrantyCode() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const randomNumber = Math.floor(Math.random() * 9000) + 1000;

  return `BH${year}${month}${date}${hour}${minute}${second}${randomNumber}`;
}

async function getUniqueWarrantyCode(tx: Prisma.TransactionClient) {
  let warrantyCode = generateWarrantyCode();

  for (let index = 0; index < 5; index++) {
    const existingWarranty = await tx.warranty.findUnique({
      where: {
        warrantyCode,
      },
    });

    if (!existingWarranty) {
      return warrantyCode;
    }

    warrantyCode = generateWarrantyCode();
  }

  throw new AppError("Không thể tạo mã bảo hành, vui lòng thử lại", 500);
}

function formatMoney(value: Prisma.Decimal | number) {
  return Number(value);
}

function formatWarranty(warranty: WarrantyWithRelations) {
  return {
    id: warranty.id,
    warrantyCode: warranty.warrantyCode,
    orderDetailId: warranty.orderDetailId,
    customerId: warranty.customerId,
    startDate: warranty.startDate,
    endDate: warranty.endDate,
    status: warranty.status,
    createdAt: warranty.createdAt,
    customer: warranty.customer,
    orderDetail: {
      id: warranty.orderDetail.id,
      orderId: warranty.orderDetail.orderId,
      productId: warranty.orderDetail.productId,
      quantity: warranty.orderDetail.quantity,
      unitPrice: formatMoney(warranty.orderDetail.unitPrice),
      lineTotal: formatMoney(warranty.orderDetail.lineTotal),
      status: warranty.orderDetail.status,
      product: {
        ...warranty.orderDetail.product,
        salePrice: formatMoney(warranty.orderDetail.product.salePrice),
      },
      order: {
        ...warranty.orderDetail.order,
        totalAmount: formatMoney(warranty.orderDetail.order.totalAmount),
      },
    },
  };
}

// GET /api/warranties?page=1&limit=10&search=&status=ACTIVE&fromDate=2026-01-01&toDate=2026-12-31
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
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");

    const where: Prisma.WarrantyWhereInput = {};

    if (search) {
      where.OR = [
        {
          warrantyCode: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          customer: {
            fullName: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          customer: {
            phone: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          orderDetail: {
            product: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
        {
          orderDetail: {
            product: {
              sku: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
        {
          orderDetail: {
            order: {
              orderCode: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
      ];
    }

    if (req.query.status) {
      const parsedStatus = warrantyStatusSchema.safeParse(status);

      if (!parsedStatus.success) {
        throw new AppError("Trạng thái bảo hành không hợp lệ", 400);
      }

      where.status = parsedStatus.data;
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

    const [warranties, totalItems] = await prisma.$transaction([
      prisma.warranty.findMany({
        where,
        include: warrantyInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.warranty.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách bảo hành thành công",
      data: {
        items: warranties.map(formatWarranty),
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

// GET /api/warranties/code/:warrantyCode
router.get(
  "/code/:warrantyCode",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const warrantyCode = String(req.params.warrantyCode || "").trim();

    if (!warrantyCode) {
      throw new AppError("Mã bảo hành không được để trống", 400);
    }

    const warranty = await prisma.warranty.findUnique({
      where: {
        warrantyCode,
      },
      include: warrantyInclude,
    });

    if (!warranty) {
      throw new AppError("Không tìm thấy phiếu bảo hành", 404);
    }

    return res.json({
      success: true,
      message: "Tra cứu bảo hành thành công",
      data: formatWarranty(warranty),
    });
  })
);

// GET /api/warranties/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const warrantyId = getWarrantyId(String(req.params.id));

    const warranty = await prisma.warranty.findUnique({
      where: {
        id: warrantyId,
      },
      include: warrantyInclude,
    });

    if (!warranty) {
      throw new AppError("Không tìm thấy phiếu bảo hành", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết bảo hành thành công",
      data: formatWarranty(warranty),
    });
  })
);

// POST /api/warranties
router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const warrantyData = validateParseResult(
      createWarrantySchema.safeParse(req.body)
    );

    const result = await prisma.$transaction(async (tx) => {
      const orderDetail = await tx.orderDetail.findUnique({
        where: {
          id: warrantyData.orderDetailId,
        },
        include: {
          order: true,
          product: true,
        },
      });

      if (!orderDetail) {
        throw new AppError("Không tìm thấy chi tiết đơn hàng", 404);
      }

      if (orderDetail.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError("Chi tiết đơn hàng này không còn hoạt động", 400);
      }

      if (orderDetail.order.status !== ORDER_STATUS.COMPLETED) {
        throw new AppError("Chỉ tạo bảo hành cho đơn hàng đã hoàn thành", 400);
      }

      if (!orderDetail.order.customerId) {
        throw new AppError("Đơn hàng chưa có khách hàng nên không thể tạo bảo hành", 400);
      }

      if (orderDetail.product.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError("Sản phẩm đang ngừng hoạt động", 400);
      }

      if (orderDetail.product.warrantyMonths <= 0) {
        throw new AppError("Sản phẩm này không có thời hạn bảo hành", 400);
      }

      const existingWarranty = await tx.warranty.findUnique({
        where: {
          orderDetailId: orderDetail.id,
        },
      });

      if (existingWarranty) {
        throw new AppError("Chi tiết đơn hàng này đã có phiếu bảo hành", 409);
      }

      const startDate = warrantyData.startDate
        ? getDateValue(warrantyData.startDate, "Ngày bắt đầu bảo hành")
        : new Date();

      if (!startDate) {
        throw new AppError("Ngày bắt đầu bảo hành không hợp lệ", 400);
      }

      const endDate = addMonths(startDate, orderDetail.product.warrantyMonths);
      const warrantyCode = await getUniqueWarrantyCode(tx);

      const warranty = await tx.warranty.create({
        data: {
          warrantyCode,
          orderDetailId: orderDetail.id,
          customerId: orderDetail.order.customerId,
          startDate,
          endDate,
          status: WARRANTY_STATUS.ACTIVE,
        },
        include: warrantyInclude,
      });

      return warranty;
    });

    return res.status(201).json({
      success: true,
      message: "Tạo phiếu bảo hành thành công",
      data: formatWarranty(result),
    });
  })
);

// PATCH /api/warranties/:id/cancel
router.patch(
  "/:id/cancel",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const warrantyId = getWarrantyId(String(req.params.id));

    const existingWarranty = await prisma.warranty.findUnique({
      where: {
        id: warrantyId,
      },
    });

    if (!existingWarranty) {
      throw new AppError("Không tìm thấy phiếu bảo hành", 404);
    }

    if (existingWarranty.status === WARRANTY_STATUS.CANCELLED) {
      throw new AppError("Phiếu bảo hành đã bị hủy trước đó", 400);
    }

    const warranty = await prisma.warranty.update({
      where: {
        id: warrantyId,
      },
      data: {
        status: WARRANTY_STATUS.CANCELLED,
      },
      include: warrantyInclude,
    });

    return res.json({
      success: true,
      message: "Hủy phiếu bảo hành thành công",
      data: formatWarranty(warranty),
    });
  })
);

// PATCH /api/warranties/:id/restore
router.patch(
  "/:id/restore",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const warrantyId = getWarrantyId(String(req.params.id));

    const existingWarranty = await prisma.warranty.findUnique({
      where: {
        id: warrantyId,
      },
    });

    if (!existingWarranty) {
      throw new AppError("Không tìm thấy phiếu bảo hành", 404);
    }

    if (existingWarranty.status === WARRANTY_STATUS.ACTIVE) {
      throw new AppError("Phiếu bảo hành đang hoạt động", 400);
    }

    const warranty = await prisma.warranty.update({
      where: {
        id: warrantyId,
      },
      data: {
        status: WARRANTY_STATUS.ACTIVE,
      },
      include: warrantyInclude,
    });

    return res.json({
      success: true,
      message: "Khôi phục phiếu bảo hành thành công",
      data: formatWarranty(warranty),
    });
  })
);

// PATCH /api/warranties/:id/expire
router.patch(
  "/:id/expire",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const warrantyId = getWarrantyId(String(req.params.id));

    const existingWarranty = await prisma.warranty.findUnique({
      where: {
        id: warrantyId,
      },
    });

    if (!existingWarranty) {
      throw new AppError("Không tìm thấy phiếu bảo hành", 404);
    }

    if (existingWarranty.status === WARRANTY_STATUS.EXPIRED) {
      throw new AppError("Phiếu bảo hành đã hết hạn trước đó", 400);
    }

    if (existingWarranty.status === WARRANTY_STATUS.CANCELLED) {
      throw new AppError("Không thể chuyển phiếu bảo hành đã hủy sang hết hạn", 400);
    }

    const warranty = await prisma.warranty.update({
      where: {
        id: warrantyId,
      },
      data: {
        status: WARRANTY_STATUS.EXPIRED,
      },
      include: warrantyInclude,
    });

    return res.json({
      success: true,
      message: "Chuyển phiếu bảo hành sang hết hạn thành công",
      data: formatWarranty(warranty),
    });
  })
);

export default router;