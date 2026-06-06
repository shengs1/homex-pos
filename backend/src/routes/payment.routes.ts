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
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  STOCK_TRANSACTION_TYPE,
  WARRANTY_STATUS,
  RECORD_STATUS,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { createAuditLog } from "../utils/auditLog";

const router = Router();

const paymentInclude = {
  order: {
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
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
      orderDetails: {
        where: {
          status: RECORD_STATUS.ACTIVE,
        },
        include: {
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
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithRelations = Prisma.PaymentGetPayload<{
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

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getPositiveId(value: string, message: string) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new AppError(message, 400);
  }

  return numberValue;
}

function getAuthenticatedUserId(req: AuthRequest) {
  if (!req.user || !req.user.userId) {
    throw new AppError("Bạn chưa đăng nhập", 401);
  }

  return req.user.userId;
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

function formatMoney(value: Prisma.Decimal | number) {
  return Number(value);
}

function formatPayment(payment: PaymentWithRelations) {
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
      user: payment.order.user,
      customer: payment.order.customer,
      orderDetails: payment.order.orderDetails.map((detail) => ({
        id: detail.id,
        orderId: detail.orderId,
        productId: detail.productId,
        quantity: detail.quantity,
        unitPrice: formatMoney(detail.unitPrice),
        lineTotal: formatMoney(detail.lineTotal),
        status: detail.status,
        product: {
          ...detail.product,
          salePrice: formatMoney(detail.product.salePrice),
        },
      })),
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

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách thanh toán thành công",
      data: {
        items: payments.map(formatPayment),
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

// PATCH /api/payments/:id/refund
router.patch(
  "/:id/refund",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);
    const paymentId = getPositiveId(
      String(req.params.id),
      "ID thanh toán không hợp lệ"
    );

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: {
          id: paymentId,
        },
        include: {
          order: {
            include: {
              orderDetails: {
                where: {
                  status: RECORD_STATUS.ACTIVE,
                },
              },
              customer: true,
            },
          },
        },
      });

      if (!payment) {
        throw new AppError("Không tìm thấy thanh toán", 404);
      }

      if (payment.status === PAYMENT_STATUS.REFUNDED) {
        throw new AppError("Thanh toán đã được hoàn tiền trước đó", 400);
      }

      if (payment.status !== PAYMENT_STATUS.PAID) {
        throw new AppError("Chỉ được hoàn tiền thanh toán đã PAID", 400);
      }

      if (payment.order.status === ORDER_STATUS.DRAFT) {
        throw new AppError("Đơn nháp chưa thanh toán nên không thể hoàn tiền", 400);
      }

      if (payment.order.status === ORDER_STATUS.COMPLETED) {
        for (const detail of payment.order.orderDetails) {
          await tx.product.update({
            where: {
              id: detail.productId,
            },
            data: {
              stockQuantity: {
                increment: detail.quantity,
              },
            },
          });

          await tx.stockTransaction.create({
            data: {
              productId: detail.productId,
              userId,
              orderId: payment.order.id,
              type: STOCK_TRANSACTION_TYPE.RESTORE,
              quantity: detail.quantity,
              note: `Hoàn kho do hoàn tiền đơn ${payment.order.orderCode}`,
            },
          });
        }

        if (payment.order.customerId) {
          const pointsToRemove = Math.floor(Number(payment.order.totalAmount) / 100000);

          if (pointsToRemove > 0 && payment.order.customer) {
            const newPoints = Math.max(payment.order.customer.points - pointsToRemove, 0);

            await tx.customer.update({
              where: {
                id: payment.order.customerId,
              },
              data: {
                points: newPoints,
              },
            });
          }
        }

        await tx.warranty.updateMany({
          where: {
            orderDetail: {
              orderId: payment.order.id,
            },
            status: WARRANTY_STATUS.ACTIVE,
          },
          data: {
            status: WARRANTY_STATUS.CANCELLED,
          },
        });

        await tx.order.update({
          where: {
            id: payment.order.id,
          },
          data: {
            status: ORDER_STATUS.CANCELLED,
          },
        });
      }

      await tx.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PAYMENT_STATUS.REFUNDED,
        },
      });

      await createAuditLog(tx, {
        userId,
        action: "REFUND_PAYMENT",
        entityType: "Payment",
        entityId: payment.id,
        description: `Hoàn tiền thanh toán của đơn ${payment.order.orderCode}`,
      });

      const updatedPayment = await tx.payment.findUnique({
        where: {
          id: payment.id,
        },
        include: paymentInclude,
      });

      if (!updatedPayment) {
        throw new AppError("Không thể lấy thanh toán sau khi hoàn tiền", 500);
      }

      return updatedPayment;
    });

    return res.json({
      success: true,
      message: "Hoàn tiền thanh toán thành công",
      data: formatPayment(result),
    });
  })
);

export default router;