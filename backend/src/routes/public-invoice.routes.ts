import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { ORDER_STATUS } from "../constants/app.constants";

const router = Router();

const vatRequestSchema = z.object({
  companyName: z.string().trim().min(1, "Tên công ty không được để trống").max(200),
  taxCode: z.string().trim().min(1, "Mã số thuế không được để trống").max(50),
  companyAddress: z.string().trim().min(1, "Địa chỉ công ty không được để trống").max(300),
  buyerEmail: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
});

function formatMoney(value: unknown) {
  return Number(value || 0);
}

async function getSetting() {
  const setting = await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: "Homex POS",
      printPaperSize: "K80",
    },
  });

  return {
    ...setting,
    maxDiscount: formatMoney(setting.maxDiscount),
  };
}

function formatPublicOrder(order: any, setting: any) {
  return {
    id: order.id,
    orderCode: order.orderCode,
    totalAmount: formatMoney(order.totalAmount),
    status: order.status,
    createdAt: order.createdAt,
    cashierName: order.user?.fullName || null,
    customer: order.customer
      ? {
          fullName: order.customer.fullName,
          phone: order.customer.phone,
        }
      : null,
    orderDetails: order.orderDetails.map((detail: any) => ({
      id: detail.id,
      productId: detail.productId,
      quantity: detail.quantity,
      unitPrice: formatMoney(detail.unitPrice),
      lineTotal: formatMoney(detail.lineTotal),
      product: detail.product
        ? {
            id: detail.product.id,
            sku: detail.product.sku,
            name: detail.product.name,
            salePrice: formatMoney(detail.product.salePrice),
            originalPrice: detail.product.originalPrice ? formatMoney(detail.product.originalPrice) : null,
          }
        : null,
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          amount: formatMoney(order.payment.amount),
          cashReceived: order.payment.cashReceived ? formatMoney(order.payment.cashReceived) : null,
          changeAmount: order.payment.changeAmount ? formatMoney(order.payment.changeAmount) : null,
          status: order.payment.status,
          paidAt: order.payment.paidAt,
        }
      : null,
    vatInvoiceRequest: order.vatInvoiceRequest || null,
    setting,
  };
}

router.get("/:orderCode", async (req, res) => {
  try {
    const orderCode = String(req.params.orderCode || "").trim();

    if (!orderCode) {
      return res.status(400).json({
        success: false,
        message: "Mã hóa đơn không hợp lệ",
      });
    }

    const [order, setting] = await Promise.all([
      prisma.order.findUnique({
        where: { orderCode },
        include: {
          user: { select: { fullName: true } },
          customer: { select: { fullName: true, phone: true } },
          orderDetails: {
            where: { status: "ACTIVE" },
            include: {
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  salePrice: true,
                  originalPrice: true,
                },
              },
            },
          },
          payment: true,
          vatInvoiceRequest: true,
        },
      }),
      getSetting(),
    ]);

    if (!order || order.status !== ORDER_STATUS.COMPLETED) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn công khai",
      });
    }

    return res.json({
      success: true,
      message: "Lấy hóa đơn công khai thành công",
      data: formatPublicOrder(order, setting),
    });
  } catch (error) {
    console.error("Public invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy hóa đơn công khai",
    });
  }
});

router.post("/:orderCode/vat-request", async (req, res) => {
  try {
    const orderCode = String(req.params.orderCode || "").trim();
    const result = vatRequestSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
      });
    }

    const order = await prisma.order.findUnique({
      where: { orderCode },
      include: {
        vatInvoiceRequest: true,
      },
    });

    if (!order || order.status !== ORDER_STATUS.COMPLETED) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hóa đơn hợp lệ",
      });
    }

    if (order.vatInvoiceRequest) {
      return res.status(409).json({
        success: false,
        message: "Hóa đơn này đã có yêu cầu VAT",
      });
    }

    const payload = result.data;
    const vatRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.vatInvoiceRequest.create({
        data: {
          orderId: order.id,
          companyName: payload.companyName,
          taxCode: payload.taxCode,
          companyAddress: payload.companyAddress,
          buyerEmail: payload.buyerEmail || null,
          note: payload.note || null,
        },
        include: {
          order: true,
        },
      });

      await tx.notification.create({
        data: {
          type: "VAT_REQUEST",
          title: "Yêu cầu hóa đơn VAT mới",
          message: `Hóa đơn ${order.orderCode} vừa gửi yêu cầu VAT`,
          targetRole: "ADMIN",
        },
      });

      return created;
    });

    return res.status(201).json({
      success: true,
      message: "Gửi yêu cầu VAT thành công",
      data: vatRequest,
    });
  } catch (error) {
    console.error("Create public VAT request error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể gửi yêu cầu VAT",
    });
  }
});

export default router;
