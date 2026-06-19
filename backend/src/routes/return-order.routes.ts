import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { ORDER_STATUS, RECORD_STATUS, STOCK_TRANSACTION_TYPE, USER_ROLES } from "../constants/app.constants";

const router = Router();

const returnItemSchema = z.object({
  orderDetailId: z.coerce.number().int().positive("Dòng hóa đơn không hợp lệ"),
  quantity: z.coerce.number().int().positive("Số lượng trả phải lớn hơn 0"),
});

const returnOrderSchema = z.object({
  orderId: z.coerce.number().int().positive("ID hóa đơn không hợp lệ"),
  reason: z.string().trim().max(500).optional(),
  items: z.array(returnItemSchema).min(1, "Phiếu trả hàng phải có ít nhất 1 sản phẩm"),
});

function getPagination(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function formatMoney(value: unknown) {
  return Number(value || 0);
}

function formatReturnOrder(order: any) {
  return {
    ...order,
    totalAmount: formatMoney(order.totalAmount),
    items:
      order.items?.map((item: any) => ({
        ...item,
        unitPrice: formatMoney(item.unitPrice),
        lineTotal: formatMoney(item.lineTotal),
      })) || [],
  };
}

function generateReturnOrderCode() {
  const now = new Date();
  const value = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    Math.floor(Math.random() * 9000) + 1000,
  ].join("");

  return `TH${value}`;
}

async function getUniqueReturnOrderCode(tx: any) {
  let returnCode = generateReturnOrderCode();

  for (let index = 0; index < 5; index += 1) {
    const existing = await tx.returnOrder.findUnique({ where: { returnCode } });
    if (!existing) return returnCode;
    returnCode = generateReturnOrderCode();
  }

  throw new Error("Không thể tạo mã phiếu trả hàng");
}

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const page = getPagination(req.query.page, 1);
      const limit = Math.min(getPagination(req.query.limit, 10), 100);
      const skip = (page - 1) * limit;
      const search = String(req.query.search || "").trim();

      const where: any = search
        ? {
            OR: [
              { returnCode: { contains: search, mode: "insensitive" } },
              { order: { orderCode: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {};

      const [items, totalItems] = await prisma.$transaction([
        prisma.returnOrder.findMany({
          where,
          include: {
            order: true,
            user: { select: { id: true, fullName: true, email: true } },
            items: { include: { product: true, orderDetail: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.returnOrder.count({ where }),
      ]);

      return res.json({
        success: true,
        message: "Lấy danh sách phiếu trả hàng thành công",
        data: {
          items: items.map(formatReturnOrder),
          pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          },
        },
      });
    } catch (error) {
      console.error("List return orders error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy danh sách phiếu trả hàng",
      });
    }
  }
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const result = returnOrderSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const userId = Number((req as AuthRequest).user?.userId || 0);
      const payload = result.data;

      const createdReturn = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: payload.orderId },
          include: {
            orderDetails: {
              where: { status: RECORD_STATUS.ACTIVE },
              include: { product: true },
            },
          },
        });

        if (!order || order.status !== ORDER_STATUS.COMPLETED) {
          throw new Error("Chỉ được trả hàng từ hóa đơn đã hoàn tất");
        }

        const requestedByDetail = new Map<number, number>();
        payload.items.forEach((item) => {
          requestedByDetail.set(item.orderDetailId, (requestedByDetail.get(item.orderDetailId) || 0) + item.quantity);
        });

        const detailIds = Array.from(requestedByDetail.keys());
        const details = order.orderDetails.filter((detail) => detailIds.includes(detail.id));

        if (details.length !== detailIds.length) {
          throw new Error("Có dòng hóa đơn không thuộc hóa đơn này");
        }

        const previousReturnItems = await tx.returnOrderItem.groupBy({
          by: ["orderDetailId"],
          where: {
            orderDetailId: { in: detailIds },
            returnOrder: {
              status: "COMPLETED",
            },
          },
          _sum: {
            quantity: true,
          },
        });

        const previousReturnMap = new Map<number, number>();
        previousReturnItems.forEach((item) => {
          previousReturnMap.set(item.orderDetailId, item._sum.quantity || 0);
        });

        let totalAmount = 0;
        const returnItems = details.map((detail) => {
          const quantity = requestedByDetail.get(detail.id) || 0;
          const alreadyReturned = previousReturnMap.get(detail.id) || 0;

          if (quantity + alreadyReturned > detail.quantity) {
            throw new Error(`Số lượng trả của ${detail.product.name} vượt số lượng đã bán`);
          }

          const unitPrice = Number(detail.unitPrice);
          const lineTotal = unitPrice * quantity;
          totalAmount += lineTotal;

          return {
            orderDetailId: detail.id,
            productId: detail.productId,
            quantity,
            unitPrice,
            lineTotal,
          };
        });

        const returnCode = await getUniqueReturnOrderCode(tx);
        const returnOrder = await tx.returnOrder.create({
          data: {
            returnCode,
            orderId: order.id,
            userId,
            totalAmount,
            reason: payload.reason || null,
            status: "COMPLETED",
            items: {
              create: returnItems,
            },
          },
        });

        for (const item of returnItems) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: { increment: item.quantity },
            },
          });

          await tx.stockTransaction.create({
            data: {
              productId: item.productId,
              userId,
              orderId: order.id,
              type: STOCK_TRANSACTION_TYPE.RESTORE,
              quantity: item.quantity,
              note: `Hoàn kho theo phiếu trả ${returnOrder.returnCode}`,
            },
          });
        }

        return tx.returnOrder.findUnique({
          where: { id: returnOrder.id },
          include: {
            order: true,
            user: { select: { id: true, fullName: true, email: true } },
            items: { include: { product: true, orderDetail: true } },
          },
        });
      });

      return res.status(201).json({
        success: true,
        message: "Tạo phiếu trả hàng thành công",
        data: formatReturnOrder(createdReturn),
      });
    } catch (error) {
      console.error("Create return order error:", error);
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Không thể tạo phiếu trả hàng",
      });
    }
  }
);

export default router;
