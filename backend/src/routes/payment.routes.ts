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
import { createAuditLog } from "../utils/audit";
import { getCustomerTier } from "../utils/tier";
import { assertPayOSConfigured, getPayOSUrls, payOS } from "../services/payos.service";

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

const createPayOSPaymentSchema = z.object({
  orderId: z.coerce.number().int().positive("ID đơn hàng không hợp lệ"),
  discountAmount: z.coerce.number().min(0, "Số tiền giảm giá không hợp lệ").optional(),
  promotionCode: z.string().trim().transform((value) => value.toUpperCase()).optional(),
});

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
    const existingWarranty = await tx.warranty.findUnique({ where: { warrantyCode } });
    if (!existingWarranty) return warrantyCode;
    warrantyCode = generateWarrantyCode();
  }

  throw new AppError("Không thể tạo mã bảo hành, vui lòng thử lại", 500);
}

function calculatePromotionDiscount(
  promotion: { discountType: string; discountValue: Prisma.Decimal | number; maxDiscountAmount?: Prisma.Decimal | number | null },
  subtotal: number
) {
  const discountValue = Number(promotion.discountValue);

  if (promotion.discountType === "PERCENT") {
    let discount = Math.floor((subtotal * discountValue) / 100);
    if (promotion.maxDiscountAmount && Number(promotion.maxDiscountAmount) > 0) {
      discount = Math.min(discount, Number(promotion.maxDiscountAmount));
    }
    return discount;
  }

  return Math.floor(discountValue);
}

function isTierEligible(customerTier: string | null | undefined, eligibleTiers: string | null | undefined) {
  if (!eligibleTiers || eligibleTiers === "ALL" || eligibleTiers === "ALL_TIERS") return true;
  const tiers = eligibleTiers.split(",").map((item) => item.trim()).filter(Boolean);
  if (tiers.includes("ALL") || tiers.includes("ALL_TIERS")) return true;
  return tiers.includes(customerTier || "NONE");
}

async function validatePromotionForPayOS(
  tx: Prisma.TransactionClient,
  promotionCode: string | undefined,
  subtotal: number,
  customerId?: number | null,
  customerTier?: string | null
) {
  const normalizedCode = String(promotionCode || "").trim().toUpperCase();
  if (!normalizedCode) return { discountAmount: 0, promotionId: null as number | null };

  const promotion = await tx.promotion.findUnique({ where: { code: normalizedCode } });
  if (!promotion || promotion.status !== "ACTIVE") throw new AppError("Mã giảm giá không hợp lệ", 400);
  if (new Date(promotion.startDate).getTime() > Date.now()) throw new AppError("Mã giảm giá chưa đến thời gian áp dụng", 400);
  if (new Date(promotion.expiredAt).getTime() < Date.now()) throw new AppError("Mã giảm giá đã hết hạn", 400);

  const usageLimit = promotion.usageLimit ? Number(promotion.usageLimit) : 0;
  const usedCount = Number(promotion.usedCount || 0);
  if (usageLimit > 0 && usedCount >= usageLimit) throw new AppError("Mã giảm giá đã hết lượt sử dụng", 400);
  if (!isTierEligible(customerTier, promotion.eligibleTiers)) throw new AppError("Voucher không áp dụng cho hạng thành viên của khách hàng này", 400);

  if (promotion.customerLimit && promotion.customerLimit > 0) {
    const isPublicVoucher = !promotion.eligibleTiers || promotion.eligibleTiers === "ALL" || promotion.eligibleTiers === "ALL_TIERS";
    if (!customerId && !isPublicVoucher) throw new AppError("Voucher này yêu cầu chọn khách hàng để áp dụng", 400);
    if (customerId) {
      const userUsageCount = await tx.order.count({ where: { customerId, promotionCode: promotion.code, status: "COMPLETED" } });
      if (userUsageCount >= promotion.customerLimit) throw new AppError("Bạn đã hết lượt dùng mã giảm giá này", 400);
    }
  }

  if (subtotal < Number(promotion.minOrderAmount || 0)) throw new AppError("Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã", 400);
  return { discountAmount: Math.min(calculatePromotionDiscount(promotion, subtotal), subtotal), promotionId: promotion.id };
}

async function completePayOSPayment(
  tx: Prisma.TransactionClient,
  paymentId: number,
  webhookData: { reference?: string; paymentLinkId?: string; orderCode?: number; amount: number },
  rawPayload: unknown
) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: {
          orderDetails: { where: { status: RECORD_STATUS.ACTIVE }, include: { product: true } },
          customer: true,
        },
      },
    },
  });

  if (!payment) throw new AppError("Không tìm thấy thanh toán", 404);
  if (payment.status === PAYMENT_STATUS.PAID) return payment;
  if (payment.status !== PAYMENT_STATUS.PENDING) throw new AppError("Trạng thái thanh toán không hợp lệ", 400);
  if (payment.order.status !== ORDER_STATUS.DRAFT) throw new AppError("Đơn hàng không còn ở trạng thái chờ thanh toán", 400);
  if (webhookData.orderCode !== undefined && Number(payment.providerOrderCode) !== Number(webhookData.orderCode)) {
    throw new AppError("Mã đơn thanh toán PayOS không khớp", 400);
  }
  if (Number(payment.amount) !== Number(webhookData.amount)) throw new AppError("Giao dịch không khớp số tiền, cần kiểm tra thủ công.", 400);

  const setting = await tx.setting.findFirst();
  const allowOversell = setting?.allowOversell === true;

  for (const detail of payment.order.orderDetails) {
    if (detail.product.status !== RECORD_STATUS.ACTIVE) {
      throw new AppError(`Sản phẩm "${detail.product.name}" đang ngừng hoạt động`, 400);
    }
    if (!allowOversell && detail.product.stockQuantity < detail.quantity) {
      throw new AppError(`Sản phẩm "${detail.product.name}" không đủ tồn kho. Hiện còn ${detail.product.stockQuantity}`, 400);
    }
  }

  for (const detail of payment.order.orderDetails) {
    await tx.orderDetail.update({ where: { id: detail.id }, data: { unitCost: detail.product.costPrice || 0 } });
    await tx.product.update({ where: { id: detail.productId }, data: { stockQuantity: { decrement: detail.quantity } } });
    await tx.stockTransaction.create({
      data: {
        productId: detail.productId,
        userId: payment.order.userId,
        orderId: payment.order.id,
        type: STOCK_TRANSACTION_TYPE.SALE,
        quantity: -detail.quantity,
        note: `Bán hàng theo đơn ${payment.order.orderCode}`,
      },
    });
  }

  let earnedPoints = 0;
  if (payment.order.customerId) {
    const POINT_CONVERSION_RATE = 10;
    earnedPoints = Math.floor(Number(payment.amount) / POINT_CONVERSION_RATE);
    if (earnedPoints > 0 && payment.order.customer) {
      const newPoints = payment.order.customer.points + earnedPoints;
      await tx.customer.update({ where: { id: payment.order.customerId }, data: { points: newPoints, tier: getCustomerTier(newPoints) } });
    }
  }

  for (const detail of payment.order.orderDetails) {
    if (detail.product.warrantyMonths > 0) {
      const existingWarranty = await tx.warranty.findUnique({ where: { orderDetailId: detail.id } });
      if (!existingWarranty) {
        const startDate = new Date();
        await tx.warranty.create({
          data: {
            warrantyCode: await getUniqueWarrantyCode(tx),
            orderDetailId: detail.id,
            customerId: payment.order.customerId,
            startDate,
            endDate: addMonths(startDate, detail.product.warrantyMonths),
            status: WARRANTY_STATUS.ACTIVE,
          },
        });
      }
    }
  }

  if (payment.order.promotionCode) {
    await tx.promotion.updateMany({ where: { code: payment.order.promotionCode, status: "ACTIVE" }, data: { usedCount: { increment: 1 } } });
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: PAYMENT_STATUS.PAID,
      paidAt: new Date(),
      providerPaymentLinkId: webhookData.paymentLinkId || payment.providerPaymentLinkId,
      providerTransactionId: webhookData.reference || payment.providerTransactionId,
      rawWebhookPayload: rawPayload as Prisma.InputJsonValue,
    },
  });

  await tx.order.update({ where: { id: payment.order.id }, data: { status: ORDER_STATUS.COMPLETED, earnedPoints } });

  await createAuditLog(tx, {
    userId: payment.order.userId,
    action: "PAYOS_WEBHOOK_PAYMENT_PAID",
    entityType: "Payment",
    entityId: payment.id,
    description: `payOS xác nhận thanh toán đơn ${payment.order.orderCode}`,
  });

  return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
}

function getPayOSPaymentCode(orderCode?: string | null) {
  const digits = String(orderCode || "").replace(/\D/g, "");
  const lastFiveDigits = digits.slice(-5).padStart(5, "0");
  return `HOMEX-${lastFiveDigits}`;
}
function formatPayOSPaymentResponse(payment: any) {
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    providerOrderCode: payment.providerOrderCode,
    amount: formatMoney(payment.amount),
    status: payment.status,
    checkoutUrl: payment.checkoutUrl,
    qrCode: payment.qrCode,
    description: payment.paymentCode,
  };
}

// POST /api/payments/payos/create
router.post(
  "/payos/create",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    assertPayOSConfigured();
    const { returnUrl, cancelUrl } = getPayOSUrls();
    const payload = createPayOSPaymentSchema.parse(req.body);

    const authReq = req as AuthRequest;

    const payment = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: payload.orderId },
        include: {
          orderDetails: { where: { status: RECORD_STATUS.ACTIVE }, include: { product: true } },
          payment: true,
          customer: true,
        },
      });

      if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
      if (order.status !== ORDER_STATUS.DRAFT) throw new AppError("Chỉ tạo payOS cho đơn hàng đang ở trạng thái nháp", 400);
      if (order.orderDetails.length === 0) throw new AppError("Đơn hàng chưa có sản phẩm", 400);

      if (order.payment) {
        if (order.payment.provider === "PAYOS" && order.payment.status === PAYMENT_STATUS.PENDING && order.payment.checkoutUrl) {
          return order.payment;
        }
        throw new AppError("Đơn hàng này đã có thanh toán", 400);
      }

      const setting = await tx.setting.findFirst();
      if (setting?.requireCustomerPhone && (!order.customerId || !order.customer?.phone)) {
        throw new AppError("Vui lòng nhập số điện thoại khách hàng trước khi thanh toán.", 400);
      }
      if (order.customerId && order.customer?.status !== RECORD_STATUS.ACTIVE) {
        throw new AppError("Khách hàng đang ngừng hoạt động", 400);
      }

      const orderSubtotal = order.orderDetails.reduce((acc, item) => acc + Number(item.lineTotal), 0);
      const promotionResult = await validatePromotionForPayOS(tx, payload.promotionCode, orderSubtotal, order.customerId, order.customer?.tier);
      const manualDiscountAmount = payload.promotionCode ? 0 : Math.min(Math.max(Number(payload.discountAmount || 0), 0), orderSubtotal);
      const finalDiscountAmount = payload.promotionCode ? promotionResult.discountAmount : manualDiscountAmount;
      const maxDiscountSetting = Number(setting?.maxDiscount || 0);
      if (maxDiscountSetting > 0 && finalDiscountAmount > maxDiscountSetting) throw new AppError("Tổng giảm giá vượt quá giới hạn cho phép.", 400);
      const finalAmount = Math.max(orderSubtotal - finalDiscountAmount, 0);

      const activeShift = await tx.shift.findFirst({ where: { userId: order.userId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      if (authReq.user?.role === USER_ROLES.CASHIER && !activeShift) {
        throw new AppError("Vui lòng mở ca trước khi thanh toán", 400);
      }

      const createdPayment = await tx.payment.create({
        data: {
          orderId: order.id,
          method: PAYMENT_METHOD.TRANSFER,
          amount: finalAmount,
          status: PAYMENT_STATUS.PENDING,
          provider: "PAYOS",
        },
      });

      const providerOrderCode = 100000000 + createdPayment.id;
      return tx.payment.update({
        where: { id: createdPayment.id },
        data: {
          providerOrderCode,
          paymentCode: getPayOSPaymentCode(order.orderCode),
          amount: finalAmount,
          order: {
            update: {
              totalAmount: finalAmount,
              promotionCode: payload.promotionCode || null,
              discountAmount: finalDiscountAmount > 0 ? finalDiscountAmount : null,
              shiftId: activeShift?.id || null,
            },
          },
        },
      });
    });

    if (payment.checkoutUrl) {
      return res.json({ success: true, message: "Đã tạo thanh toán payOS.", data: formatPayOSPaymentResponse(payment) });
    }

    const orderWithItems = await prisma.order.findUnique({
      where: { id: payment.orderId },
      include: { orderDetails: { where: { status: RECORD_STATUS.ACTIVE }, include: { product: true } } },
    });

    if (!orderWithItems || !payment.providerOrderCode) throw new AppError("Không thể tạo thanh toán payOS. Vui lòng thử lại.", 500);

    const paymentLink = await payOS.paymentRequests.create({
      orderCode: payment.providerOrderCode,
      amount: Number(payment.amount),
      description: payment.paymentCode || getPayOSPaymentCode(orderWithItems.orderCode),
      items: orderWithItems.orderDetails.map((item) => ({
        name: item.product.name.slice(0, 50),
        quantity: item.quantity,
        price: Number(item.unitPrice),
      })),
      cancelUrl,
      returnUrl,
    });

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        checkoutUrl: paymentLink.checkoutUrl,
        qrCode: paymentLink.qrCode,
        providerPaymentLinkId: paymentLink.paymentLinkId,
      },
    });

    return res.json({ success: true, message: "Đã tạo thanh toán payOS.", data: formatPayOSPaymentResponse(updatedPayment) });
  })
);

// POST /api/payments/webhook/payos
router.post(
  "/webhook/payos",
  catchAsync(async (req, res) => {
    let webhookData: Awaited<ReturnType<typeof payOS.webhooks.verify>>;

    // Trust boundary: the frontend never marks a payment as paid. Only a payload
    // verified with the PayOS checksum key, or a direct PayOS status query, may do so.
    try {
      webhookData = await payOS.webhooks.verify(req.body);
    } catch (error) {
      await prisma.paymentWebhookLog.create({
        data: { provider: "PAYOS", payload: req.body as Prisma.InputJsonValue, status: "FAILED", errorMessage: "Webhook payOS không hợp lệ" },
      });
      return res.status(400).json({ success: false, message: "Webhook payOS không hợp lệ" });
    }

    const payment = await prisma.payment.findUnique({ where: { providerOrderCode: webhookData.orderCode } });
    if (!payment) {
      await prisma.paymentWebhookLog.create({
        data: { provider: "PAYOS", eventId: webhookData.reference, orderCode: webhookData.orderCode, payload: req.body as Prisma.InputJsonValue, status: "UNMATCHED" },
      });
      return res.json({ success: true, message: "Webhook payOS processed." });
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        // PostgreSQL row lock serializes concurrent webhook deliveries for the same
        // payment. A replay that arrives while the first request is processing must
        // wait, then observes PAID and cannot decrement stock or award points twice.
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`);

        const lockedPayment = await tx.payment.findUnique({ where: { id: payment.id } });
        if (!lockedPayment) throw new AppError("Không tìm thấy thanh toán", 404);

        const processedEvent = webhookData.reference
          ? await tx.paymentWebhookLog.findFirst({
              where: { provider: "PAYOS", eventId: webhookData.reference, status: "PROCESSED" },
              select: { id: true },
            })
          : null;

        if (lockedPayment.status === PAYMENT_STATUS.PAID || processedEvent) {
          await tx.paymentWebhookLog.create({
            data: {
              provider: "PAYOS",
              eventId: webhookData.reference,
              paymentId: payment.id,
              orderCode: webhookData.orderCode,
              payload: req.body as Prisma.InputJsonValue,
              status: "DUPLICATE",
            },
          });
          return "DUPLICATE" as const;
        }

        if (Number(lockedPayment.providerOrderCode) !== Number(webhookData.orderCode)) {
          throw new AppError("Mã đơn thanh toán PayOS không khớp", 400);
        }

        await completePayOSPayment(tx, payment.id, webhookData, req.body);
        await tx.paymentWebhookLog.create({
          data: {
            provider: "PAYOS",
            eventId: webhookData.reference,
            paymentId: payment.id,
            orderCode: webhookData.orderCode,
            payload: req.body as Prisma.InputJsonValue,
            status: "PROCESSED",
          },
        });
        return "PROCESSED" as const;
      });

      return res.json({ success: true, message: "Webhook payOS processed.", data: { outcome } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Không thể xử lý webhook payOS";
      await prisma.paymentWebhookLog.create({
        data: { provider: "PAYOS", eventId: webhookData.reference, paymentId: payment.id, orderCode: webhookData.orderCode, payload: req.body as Prisma.InputJsonValue, status: "FAILED", errorMessage },
      });
      return res.status(400).json({ success: false, message: errorMessage });
    }
  })
);

// GET /api/payments/:id/status
router.get(
  "/:id/status",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    const paymentId = getPositiveId(String(req.params.id), "ID thanh toán không hợp lệ");
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment) throw new AppError("Không tìm thấy thanh toán", 404);

    let resultPayment = payment;

    // Actively query PayOS API if local state is pending as a robust backup to webhook
    if (payment.status === PAYMENT_STATUS.PENDING && payment.provider === "PAYOS" && payment.providerOrderCode) {
      try {
        const payOSInfo = await payOS.paymentRequests.get(payment.providerOrderCode);
        if (payOSInfo && payOSInfo.status === "PAID") {
          await prisma.$transaction(async (tx) => {
            await completePayOSPayment(
              tx,
              payment.id,
              {
                reference: payOSInfo.transactions?.[0]?.reference || "",
                paymentLinkId: payOSInfo.id || "",
                orderCode: payment.providerOrderCode || undefined,
                amount: payOSInfo.amount,
              },
              payOSInfo
            );
          });
          const updatedPayment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
          if (updatedPayment) {
            resultPayment = updatedPayment;
          }
        }
      } catch (payosError) {
        console.error("Error actively syncing PayOS status:", payosError);
      }
    }

    return res.json({
      success: true,
      data: {
        paymentId: resultPayment.id,
        orderId: resultPayment.orderId,
        status: resultPayment.status,
        orderStatus: resultPayment.order.status,
        paidAt: resultPayment.paidAt,
      },
    });
  })
);
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
          const pointsToRemove = payment.order.earnedPoints;

          if (pointsToRemove > 0 && payment.order.customer) {
            const newPoints = Math.max(payment.order.customer.points - pointsToRemove, 0);

            await tx.customer.update({
              where: {
                id: payment.order.customerId,
              },
              data: {
                points: newPoints,
                tier: getCustomerTier(newPoints),
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




