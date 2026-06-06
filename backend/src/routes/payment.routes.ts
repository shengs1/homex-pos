import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
  AuthRequest,
} from "../middlewares/auth.middleware";
import {
  USER_ROLES,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { createAuditLog } from "../utils/auditLog";

const router = Router();

const paymentInclude = {
  order: {
    include: {
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
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

const paymentMethodSchema = z.enum([
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.TRANSFER,
  PAYMENT_METHOD.WALLET,
]);

const paymentStatusSchema = z.enum([
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.FAILED,
  PAYMENT_STATUS.REFUNDED,
]);

const updatePaymentStatusSchema = z.object({
  status: paymentStatusSchema,
});

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getPositiveId(value: string, message: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(message, 400);
  }

  return id;
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

function formatMoney(value: Prisma.Decimal | number) {
  return Number(value);
}

function formatPayment(payment: PaymentWithOrder) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    amount: formatMoney(payment.amount),
    status: payment.status,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    order: {
      id: payment.order.id,
      orderCode: payment.order.orderCode,
      userId: payment.order.userId,
      customerId: payment.order.customerId,
      totalAmount: formatMoney(payment.order.totalAmount),
      status: payment.order.status,
      createdAt: payment.order.createdAt,
      updatedAt: payment.order.updatedAt,
      customer: payment.order.customer,
      user: payment.order.user,
    },
  };
}

// GET /api/payments?page=1&limit=10&search=&method=CASH&status=PAID&fromDate=2026-01-01&toDate=2026-12-31
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const method = String(req.query.method || "").trim().toUpperCase();
    const status = String(req.query.status || "").trim().toUpperCase();
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");

    const where: Prisma.PaymentWhereInput = {};

    if (search) {
      where.OR = [
        {
          order: {
            orderCode: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          order: {
            customer: {
              fullName: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
        {
          order: {
            customer: {
              phone: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
      ];
    }

    if (req.query.method) {
      const parsedMethod = paymentMethodSchema.safeParse(method);

      if (!parsedMethod.success) {
        throw new AppError("Phương thức thanh toán không hợp lệ", 400);
      }

      where.method = parsedMethod.data;
    }

    if (req.query.status) {
      const parsedStatus = paymentStatusSchema.safeParse(status);

      if (!parsedStatus.success) {
        throw new AppError("Trạng thái thanh toán không hợp lệ", 400);
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

    const [payments, totalItems] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.payment.count({
        where,
      }),
    ]);

    return res.json({
      success: true,
      message: "Lấy danh sách thanh toán thành công",
      data: {
        items: payments.map(formatPayment),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      },
    });
  })
);

// GET /api/payments/order/:orderId
router.get(
  "/order/:orderId",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const orderId = getPositiveId(
      String(req.params.orderId),
      "ID đơn hàng không hợp lệ"
    );

    const payment = await prisma.payment.findUnique({
      where: {
        orderId,
      },
      include: paymentInclude,
    });

    if (!payment) {
      throw new AppError("Không tìm thấy thanh toán của đơn hàng", 404);
    }

    return res.json({
      success: true,
      message: "Lấy thanh toán theo đơn hàng thành công",
      data: formatPayment(payment),
    });
  })
);

// GET /api/payments/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const paymentId = getPositiveId(
      String(req.params.id),
      "ID thanh toán không hợp lệ"
    );

    const payment = await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
      include: paymentInclude,
    });

    if (!payment) {
      throw new AppError("Không tìm thấy thanh toán", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết thanh toán thành công",
      data: formatPayment(payment),
    });
  })
);

// PATCH /api/payments/:id/status
router.patch(
  "/:id/status",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);

    const paymentId = getPositiveId(
      String(req.params.id),
      "ID thanh toán không hợp lệ"
    );

    const paymentData = validateParseResult(
      updatePaymentStatusSchema.safeParse(req.body)
    );

    if (paymentData.status === PAYMENT_STATUS.REFUNDED) {
      throw new AppError(
        "Không cập nhật REFUNDED trực tiếp tại Payment. Hãy hủy đơn hàng để hệ thống hoàn kho và hoàn tiền đúng quy trình",
        400
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: {
          id: paymentId,
        },
        include: {
          order: true,
        },
      });

      if (!existingPayment) {
        throw new AppError("Không tìm thấy thanh toán", 404);
      }

      if (existingPayment.status === PAYMENT_STATUS.REFUNDED) {
        throw new AppError("Thanh toán đã hoàn tiền, không thể cập nhật", 400);
      }

      const updatedPayment = await tx.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          status: paymentData.status,
          paidAt:
            paymentData.status === PAYMENT_STATUS.PAID
              ? existingPayment.paidAt || new Date()
              : null,
        },
        include: paymentInclude,
      });

      await createAuditLog(tx, {
        userId,
        action: AUDIT_ACTION.UPDATE_PAYMENT_STATUS,
        entityType: AUDIT_ENTITY_TYPE.PAYMENT,
        entityId: updatedPayment.id,
        description: `Cập nhật trạng thái thanh toán của đơn ${existingPayment.order.orderCode} từ ${existingPayment.status} sang ${updatedPayment.status}`,
      });

      return updatedPayment;
    });

    return res.json({
      success: true,
      message: "Cập nhật trạng thái thanh toán thành công",
      data: formatPayment(result),
    });
  })
);

export default router;