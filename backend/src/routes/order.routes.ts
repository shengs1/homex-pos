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
  RECORD_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  STOCK_TRANSACTION_TYPE,
  WARRANTY_STATUS,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { createAuditLog } from "../utils/auditLog";

const router = Router();

const orderInclude = {
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
          originalPrice: true,
          imageUrl: true,
          warrantyMonths: true,
          status: true,
        },
      },
      warranty: {
        select: {
          id: true,
          warrantyCode: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
        },
      },
    },
  },
  payment: true,
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

const paymentMethodSchema = z.enum([
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.TRANSFER,
  PAYMENT_METHOD.WALLET,
]);

const orderItemSchema = z.object({
  productId: z.coerce
    .number()
    .int("ID sản phẩm phải là số nguyên")
    .positive("ID sản phẩm không hợp lệ"),

  quantity: z.coerce
    .number()
    .int("Số lượng phải là số nguyên")
    .positive("Số lượng phải lớn hơn 0")
    .max(1000, "Số lượng sản phẩm quá lớn"),
});

const draftOrderSchema = z.object({
  customerId: z.coerce
    .number()
    .int("ID khách hàng phải là số nguyên")
    .positive("ID khách hàng không hợp lệ")
    .optional(),

  discountAmount: z.coerce
    .number()
    .min(0, "Số tiền giảm giá không hợp lệ")
    .optional(),

  promotionCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .optional(),

  items: z.array(orderItemSchema).min(1, "Đơn hàng phải có ít nhất 1 sản phẩm"),
});

const checkoutOrderSchema = z.object({
  paymentMethod: paymentMethodSchema,

  cashReceived: z.coerce
    .number()
    .min(0, "Tiền khách đưa không hợp lệ")
    .optional(),

  discountAmount: z.coerce
    .number()
    .min(0, "Số tiền giảm giá không hợp lệ")
    .optional(),

  promotionCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .optional(),
});

function getPaginationValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return numberValue;
}

function getOrderId(value: string) {
  const orderId = Number(value);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new AppError("ID đơn hàng không hợp lệ", 400);
  }

  return orderId;
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

function calculatePromotionDiscount(
  promotion: { discountType: string; discountValue: Prisma.Decimal | number },
  subtotal: number
) {
  const discountValue = Number(promotion.discountValue);

  if (promotion.discountType === "PERCENT") {
    return Math.floor((subtotal * discountValue) / 100);
  }

  return Math.floor(discountValue);
}

async function validateAndUsePromotion(
  tx: Prisma.TransactionClient,
  promotionCode: string | undefined,
  subtotal: number
) {
  const normalizedCode = String(promotionCode || "").trim().toUpperCase();

  if (!normalizedCode) {
    return { discountAmount: 0, promotionId: null as number | null };
  }

  const promotion = await tx.promotion.findUnique({
    where: {
      code: normalizedCode,
    },
  });

  if (!promotion || promotion.status !== "ACTIVE") {
    throw new AppError("Mã giảm giá không hợp lệ", 400);
  }

  if (new Date(promotion.expiredAt).getTime() < Date.now()) {
    throw new AppError("Mã giảm giá đã hết hạn", 400);
  }

  const usageLimit = promotion.usageLimit ? Number(promotion.usageLimit) : 0;
  const usedCount = Number(promotion.usedCount || 0);

  if (usageLimit > 0 && usedCount >= usageLimit) {
    throw new AppError("Mã giảm giá đã hết lượt sử dụng", 400);
  }

  if (subtotal < Number(promotion.minOrderAmount || 0)) {
    throw new AppError("Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã", 400);
  }

  const discountAmount = Math.min(calculatePromotionDiscount(promotion, subtotal), subtotal);

  await tx.promotion.update({
    where: {
      id: promotion.id,
    },
    data: {
      usedCount: {
        increment: 1,
      },
    },
  });

  return {
    discountAmount,
    promotionId: promotion.id,
  };
}

function formatOrder(order: OrderWithRelations) {
  return {
    id: order.id,
    orderCode: order.orderCode,
    userId: order.userId,
    customerId: order.customerId,
    shiftId: order.shiftId,
    totalAmount: formatMoney(order.totalAmount),
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    user: order.user,
    customer: order.customer,
    orderDetails: order.orderDetails.map((detail) => ({
      id: detail.id,
      orderId: detail.orderId,
      productId: detail.productId,
      quantity: detail.quantity,
      unitPrice: formatMoney(detail.unitPrice),
      lineTotal: formatMoney(detail.lineTotal),
      status: detail.status,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      product: {
        ...detail.product,
        salePrice: formatMoney(detail.product.salePrice),
        originalPrice: detail.product.originalPrice ? formatMoney(detail.product.originalPrice) : null,
      },
      warranty: detail.warranty,
    })),
    payment: order.payment
      ? {
          id: order.payment.id,
          orderId: order.payment.orderId,
          method: order.payment.method,
          amount: formatMoney(order.payment.amount),
          cashReceived: order.payment.cashReceived ? formatMoney(order.payment.cashReceived) : null,
          changeAmount: order.payment.changeAmount ? formatMoney(order.payment.changeAmount) : null,
          status: order.payment.status,
          paidAt: order.payment.paidAt,
          createdAt: order.payment.createdAt,
          updatedAt: order.payment.updatedAt,
        }
      : null,
  };
}

function generateOrderCode() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const randomNumber = Math.floor(Math.random() * 9000) + 1000;

  return `HD${year}${month}${date}${hour}${minute}${second}${randomNumber}`;
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

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function getUniqueOrderCode(tx: Prisma.TransactionClient) {
  let orderCode = generateOrderCode();

  for (let index = 0; index < 5; index++) {
    const existingOrder = await tx.order.findUnique({
      where: {
        orderCode,
      },
    });

    if (!existingOrder) {
      return orderCode;
    }

    orderCode = generateOrderCode();
  }

  throw new AppError("Không thể tạo mã đơn hàng, vui lòng thử lại", 500);
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

function mergeDuplicateItems(
  items: {
    productId: number;
    quantity: number;
  }[]
) {
  const itemMap = new Map<number, number>();

  for (const item of items) {
    const currentQuantity = itemMap.get(item.productId) || 0;
    itemMap.set(item.productId, currentQuantity + item.quantity);
  }

  return Array.from(itemMap.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

async function checkActiveCustomer(
  tx: Prisma.TransactionClient,
  customerId?: number
) {
  if (!customerId) {
    return;
  }

  const customer = await tx.customer.findUnique({
    where: {
      id: customerId,
    },
  });

  if (!customer) {
    throw new AppError("Không tìm thấy khách hàng", 404);
  }

  if (customer.status !== RECORD_STATUS.ACTIVE) {
    throw new AppError("Khách hàng đang ngừng hoạt động", 400);
  }
}

async function buildOrderDetailsFromItems(
  tx: Prisma.TransactionClient,
  items: {
    productId: number;
    quantity: number;
  }[]
) {
  const mergedItems = mergeDuplicateItems(items);

  const productIds = mergedItems.map((item) => item.productId);

  const products = await tx.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
  });

  if (products.length !== productIds.length) {
    throw new AppError("Có sản phẩm không tồn tại", 404);
  }

  let totalAmount = 0;

  const orderDetails: {
    productId: number;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[] = [];

  for (const item of mergedItems) {
    const product = products.find(
      (productItem) => productItem.id === item.productId
    );

    if (!product) {
      throw new AppError("Có sản phẩm không tồn tại", 404);
    }

    if (product.status !== RECORD_STATUS.ACTIVE) {
      throw new AppError(
        `Sản phẩm "${product.name}" đang ngừng hoạt động`,
        400
      );
    }

    const unitPrice = Number(product.salePrice);
    const lineTotal = unitPrice * item.quantity;

    totalAmount += lineTotal;

    orderDetails.push({
      productId: product.id,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    });
  }

  return {
    totalAmount,
    orderDetails,
  };
}

async function getFullOrder(tx: Prisma.TransactionClient, orderId: number) {
  const order = await tx.order.findUnique({
    where: {
      id: orderId,
    },
    include: orderInclude,
  });

  if (!order) {
    throw new AppError("Không tìm thấy đơn hàng", 404);
  }

  return order;
}

// GET /api/orders?page=1&limit=10&search=&status=DRAFT
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

    const where: Prisma.OrderWhereInput = {};

    if (search) {
      where.OR = [
        {
          orderCode: {
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
      ];
    }

    if (req.query.status) {
      if (
        status !== ORDER_STATUS.DRAFT &&
        status !== ORDER_STATUS.COMPLETED &&
        status !== ORDER_STATUS.CANCELLED
      ) {
        throw new AppError("Trạng thái đơn hàng không hợp lệ", 400);
      }

      where.status = status;
    }

    const [orders, totalItems] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.order.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách đơn hàng thành công",
      data: {
        items: orders.map(formatOrder),
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

// GET /api/orders/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const orderId = getOrderId(String(req.params.id));

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: orderInclude,
    });

    if (!order) {
      throw new AppError("Không tìm thấy đơn hàng", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data: formatOrder(order),
    });
  })
);

// POST /api/orders/draft
router.post(
  "/draft",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);

    const orderData = validateParseResult(draftOrderSchema.safeParse(req.body));

    const result = await prisma.$transaction(async (tx) => {
      await checkActiveCustomer(tx, orderData.customerId);

      const { totalAmount, orderDetails } = await buildOrderDetailsFromItems(
        tx,
        orderData.items
      );

      const orderCode = await getUniqueOrderCode(tx);

      const createdOrder = await tx.order.create({
        data: {
          orderCode,
          userId,
          customerId: orderData.customerId || null,
          totalAmount,
          status: ORDER_STATUS.DRAFT,
          orderDetails: {
            create: orderDetails.map((detail) => ({
              productId: detail.productId,
              quantity: detail.quantity,
              unitPrice: detail.unitPrice,
              lineTotal: detail.lineTotal,
              status: RECORD_STATUS.ACTIVE,
            })),
          },
        },
      });

      await createAuditLog(tx, {
        userId,
        action: "CREATE_DRAFT_ORDER",
        entityType: "Order",
        entityId: createdOrder.id,
        description: `Tạo đơn nháp ${createdOrder.orderCode}`,
      });

      return getFullOrder(tx, createdOrder.id);
    });

    return res.status(201).json({
      success: true,
      message: "Tạo đơn nháp thành công",
      data: formatOrder(result),
    });
  })
);

// PUT /api/orders/:id/draft
router.put(
  "/:id/draft",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);
    const orderId = getOrderId(String(req.params.id));
    const orderData = validateParseResult(draftOrderSchema.safeParse(req.body));

    const result = await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: {
          id: orderId,
        },
      });

      if (!existingOrder) {
        throw new AppError("Không tìm thấy đơn hàng", 404);
      }

      if (existingOrder.status !== ORDER_STATUS.DRAFT) {
        throw new AppError("Chỉ được cập nhật đơn hàng đang ở trạng thái nháp", 400);
      }

      await checkActiveCustomer(tx, orderData.customerId);

      const { totalAmount, orderDetails } = await buildOrderDetailsFromItems(
        tx,
        orderData.items
      );

      await tx.orderDetail.updateMany({
        where: {
          orderId,
          status: RECORD_STATUS.ACTIVE,
        },
        data: {
          status: RECORD_STATUS.INACTIVE,
        },
      });

      await tx.orderDetail.createMany({
        data: orderDetails.map((detail) => ({
          orderId,
          productId: detail.productId,
          quantity: detail.quantity,
          unitPrice: detail.unitPrice,
          lineTotal: detail.lineTotal,
          status: RECORD_STATUS.ACTIVE,
        })),
      });

      await tx.order.update({
        where: {
          id: orderId,
        },
        data: {
          customerId: orderData.customerId || null,
          totalAmount,
        },
      });

      await createAuditLog(tx, {
        userId,
        action: "UPDATE_DRAFT_ORDER",
        entityType: "Order",
        entityId: orderId,
        description: `Cập nhật đơn nháp ${existingOrder.orderCode}`,
      });

      return getFullOrder(tx, orderId);
    });

    return res.json({
      success: true,
      message: "Cập nhật đơn nháp thành công",
      data: formatOrder(result),
    });
  })
);

// PATCH /api/orders/:id/checkout
router.patch(
  "/:id/checkout",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);
    const orderId = getOrderId(String(req.params.id));

    const checkoutData = validateParseResult(
      checkoutOrderSchema.safeParse(req.body)
    );

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: {
          id: orderId,
        },
        include: {
          orderDetails: {
            where: {
              status: RECORD_STATUS.ACTIVE,
            },
          },
          payment: true,
          customer: true,
        },
      });

      if (!order) {
        throw new AppError("Không tìm thấy đơn hàng", 404);
      }

      if (order.status !== ORDER_STATUS.DRAFT) {
        throw new AppError("Chỉ được thanh toán đơn hàng đang ở trạng thái nháp", 400);
      }

      if (order.payment) {
        throw new AppError("Đơn hàng này đã có thanh toán", 400);
      }

      if (order.orderDetails.length === 0) {
        throw new AppError("Đơn hàng chưa có sản phẩm", 400);
      }

      if (order.customerId) {
        if (!order.customer) {
          throw new AppError("Không tìm thấy khách hàng", 404);
        }

        if (order.customer.status !== RECORD_STATUS.ACTIVE) {
          throw new AppError("Khách hàng đang ngừng hoạt động", 400);
        }
      }

      const orderSubtotal = Number(order.totalAmount);
      const promotionResult = await validateAndUsePromotion(
        tx,
        checkoutData.promotionCode,
        orderSubtotal
      );

      const manualDiscountAmount = checkoutData.promotionCode
        ? 0
        : Math.min(Math.max(Number(checkoutData.discountAmount || 0), 0), orderSubtotal);

      const finalDiscountAmount = checkoutData.promotionCode
        ? promotionResult.discountAmount
        : manualDiscountAmount;

      const finalAmount = Math.max(orderSubtotal - finalDiscountAmount, 0);
      const cashReceived =
        checkoutData.paymentMethod === PAYMENT_METHOD.CASH
          ? Number(checkoutData.cashReceived || 0)
          : null;
      const changeAmount =
        checkoutData.paymentMethod === PAYMENT_METHOD.CASH
          ? Math.max(cashReceived - finalAmount, 0)
          : null;

      if (checkoutData.paymentMethod === PAYMENT_METHOD.CASH && cashReceived < finalAmount) {
        throw new AppError("Tiền khách đưa chưa đủ để thanh toán", 400);
      }

      const activeShift = await tx.shift.findFirst({
        where: {
          userId,
          status: "OPEN",
        },
        orderBy: {
          openedAt: "desc",
        },
      });

      if (authReq.user?.role === USER_ROLES.CASHIER && !activeShift) {
        throw new AppError("Vui lòng mở ca trước khi thanh toán", 400);
      }

      const productIds = order.orderDetails.map((detail) => detail.productId);

      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });

      if (products.length !== productIds.length) {
        throw new AppError("Có sản phẩm trong đơn không tồn tại", 404);
      }

      for (const detail of order.orderDetails) {
        const product = products.find(
          (productItem) => productItem.id === detail.productId
        );

        if (!product) {
          throw new AppError("Có sản phẩm trong đơn không tồn tại", 404);
        }

        if (product.status !== RECORD_STATUS.ACTIVE) {
          throw new AppError(
            `Sản phẩm "${product.name}" đang ngừng hoạt động`,
            400
          );
        }

        if (product.stockQuantity < detail.quantity) {
          throw new AppError(
            `Sản phẩm "${product.name}" không đủ tồn kho. Hiện còn ${product.stockQuantity}`,
            400
          );
        }
      }

      for (const detail of order.orderDetails) {
        await tx.product.update({
          where: {
            id: detail.productId,
          },
          data: {
            stockQuantity: {
              decrement: detail.quantity,
            },
          },
        });

        await tx.stockTransaction.create({
          data: {
            productId: detail.productId,
            userId,
            orderId: order.id,
            type: STOCK_TRANSACTION_TYPE.SALE,
            quantity: -detail.quantity,
            note: `Bán hàng theo đơn ${order.orderCode}`,
          },
        });
      }

      await tx.payment.create({
        data: {
          orderId: order.id,
          method: checkoutData.paymentMethod,
          amount: finalAmount,
          cashReceived,
          changeAmount,
          status: PAYMENT_STATUS.PAID,
          paidAt: new Date(),
        },
      });

      if (order.customerId) {
        const earnedPoints = Math.floor(finalAmount / 100000);

        if (earnedPoints > 0) {
          await tx.customer.update({
            where: {
              id: order.customerId,
            },
            data: {
              points: {
                increment: earnedPoints,
              },
            },
          });
        }

        for (const detail of order.orderDetails) {
          const product = products.find(
            (productItem) => productItem.id === detail.productId
          );

          if (product && product.warrantyMonths > 0) {
            const existingWarranty = await tx.warranty.findUnique({
              where: {
                orderDetailId: detail.id,
              },
            });

            if (!existingWarranty) {
              const startDate = new Date();
              const endDate = addMonths(startDate, product.warrantyMonths);
              const warrantyCode = await getUniqueWarrantyCode(tx);

              await tx.warranty.create({
                data: {
                  warrantyCode,
                  orderDetailId: detail.id,
                  customerId: order.customerId,
                  startDate,
                  endDate,
                  status: WARRANTY_STATUS.ACTIVE,
                },
              });
            }
          }
        }
      }

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          totalAmount: finalAmount,
          shiftId: activeShift?.id || null,
          status: ORDER_STATUS.COMPLETED,
        },
      });

      await createAuditLog(tx, {
        userId,
        action: "CHECKOUT_ORDER",
        entityType: "Order",
        entityId: order.id,
        description: `Thanh toán đơn hàng ${order.orderCode}`,
      });

      return getFullOrder(tx, order.id);
    });

    return res.json({
      success: true,
      message: "Thanh toán đơn hàng thành công",
      data: formatOrder(result),
    });
  })
);

// PATCH /api/orders/:id/cancel
router.patch(
  "/:id/cancel",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = getAuthenticatedUserId(authReq);
    const orderId = getOrderId(String(req.params.id));

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: {
          id: orderId,
        },
        include: {
          orderDetails: {
            where: {
              status: RECORD_STATUS.ACTIVE,
            },
          },
          payment: true,
        },
      });

      if (!order) {
        throw new AppError("Không tìm thấy đơn hàng", 404);
      }

      if (order.status === ORDER_STATUS.CANCELLED) {
        throw new AppError("Đơn hàng đã bị hủy trước đó", 400);
      }

      if (order.status === ORDER_STATUS.DRAFT) {
        await tx.order.update({
          where: {
            id: order.id,
          },
          data: {
            status: ORDER_STATUS.CANCELLED,
          },
        });

        await createAuditLog(tx, {
          userId,
          action: "CANCEL_DRAFT_ORDER",
          entityType: "Order",
          entityId: order.id,
          description: `Hủy đơn nháp ${order.orderCode}`,
        });

        return getFullOrder(tx, order.id);
      }

      if (order.status !== ORDER_STATUS.COMPLETED) {
        throw new AppError("Trạng thái đơn hàng không hợp lệ để hủy", 400);
      }

      if (authReq.user?.role !== USER_ROLES.ADMIN) {
        throw new AppError("Bạn không có quyền hủy đơn hàng đã hoàn tất", 403);
      }

      for (const detail of order.orderDetails) {
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
            orderId: order.id,
            type: STOCK_TRANSACTION_TYPE.RESTORE,
            quantity: detail.quantity,
            note: `Hoàn kho do hủy đơn ${order.orderCode}`,
          },
        });
      }

      if (order.customerId) {
        const pointsToRemove = Math.floor(Number(order.totalAmount) / 100000);

        if (pointsToRemove > 0) {
          const customer = await tx.customer.findUnique({
            where: {
              id: order.customerId,
            },
          });

          if (customer) {
            const newPoints = Math.max(customer.points - pointsToRemove, 0);

            await tx.customer.update({
              where: {
                id: order.customerId,
              },
              data: {
                points: newPoints,
              },
            });
          }
        }
      }

      await tx.warranty.updateMany({
        where: {
          orderDetail: {
            orderId: order.id,
          },
          status: WARRANTY_STATUS.ACTIVE,
        },
        data: {
          status: WARRANTY_STATUS.CANCELLED,
        },
      });

      if (order.payment) {
        await tx.payment.update({
          where: {
            orderId: order.id,
          },
          data: {
            status: PAYMENT_STATUS.REFUNDED,
          },
        });
      }

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: ORDER_STATUS.CANCELLED,
        },
      });

      await createAuditLog(tx, {
        userId,
        action: "CANCEL_COMPLETED_ORDER",
        entityType: "Order",
        entityId: order.id,
        description: `Hủy đơn đã hoàn thành ${order.orderCode}`,
      });

      return getFullOrder(tx, order.id);
    });

    return res.json({
      success: true,
      message: "Hủy đơn hàng thành công",
      data: formatOrder(result),
    });
  })
);

export default router;
