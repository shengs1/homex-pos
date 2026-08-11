import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { RECORD_STATUS, STOCK_TRANSACTION_TYPE, USER_ROLES } from "../constants/app.constants";
import { createAuditLog } from "../utils/audit";

const router = Router();

const purchaseOrderItemSchema = z.object({
  productId: z.coerce.number().int().positive("ID sản phẩm không hợp lệ"),
  quantity: z.coerce.number().int().positive("Số lượng nhập phải lớn hơn 0"),
  unitCost: z.coerce.number().min(0, "Giá nhập không hợp lệ"),
});

const purchaseOrderSchema = z.object({
  supplierId: z.coerce.number().int().positive("ID nhà cung cấp không hợp lệ"),
  note: z.string().trim().max(500).optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "Phiếu nhập phải có ít nhất 1 sản phẩm"),
});

function getPagination(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function formatMoney(value: unknown) {
  return Number(value || 0);
}

function formatPurchaseOrder(order: any) {
  return {
    ...order,
    totalAmount: formatMoney(order.totalAmount),
    items:
      order.items?.map((item: any) => ({
        ...item,
        unitCost: formatMoney(item.unitCost),
        lineTotal: formatMoney(item.lineTotal),
      })) || [],
  };
}

function generatePurchaseOrderCode() {
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

  return `PN${value}`;
}

async function getUniquePurchaseOrderCode(tx: any) {
  let code = generatePurchaseOrderCode();

  for (let index = 0; index < 5; index += 1) {
    const existing = await tx.purchaseOrder.findUnique({ where: { code } });
    if (!existing) return code;
    code = generatePurchaseOrderCode();
  }

  throw new Error("Không thể tạo mã phiếu nhập");
}

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const page = getPagination(req.query.page, 1);
      const limit = Math.min(getPagination(req.query.limit, 10), 100);
      const skip = (page - 1) * limit;
      const search = String(req.query.search || "").trim();

      const where: any = search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { supplier: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {};

      const [items, totalItems] = await prisma.$transaction([
        prisma.purchaseOrder.findMany({
          where,
          include: {
            supplier: true,
            user: { select: { id: true, fullName: true, email: true } },
            items: { include: { product: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.purchaseOrder.count({ where }),
      ]);

      return res.json({
        success: true,
        message: "Lấy danh sách phiếu nhập thành công",
        data: {
          items: items.map(formatPurchaseOrder),
          pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          },
        },
      });
    } catch (error) {
      console.error("List purchase orders error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy danh sách phiếu nhập",
      });
    }
  }
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const result = purchaseOrderSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const userId = Number((req as AuthRequest).user?.userId || 0);
      const payload = result.data;

      const createdOrder = await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findUnique({ where: { id: payload.supplierId } });

        if (!supplier || supplier.status !== RECORD_STATUS.ACTIVE) {
          throw new Error("Nhà cung cấp không tồn tại hoặc đang ngừng hoạt động");
        }

        const productIds = payload.items.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: {
            id: { in: productIds },
          },
        });

        if (products.length !== new Set(productIds).size) {
          throw new Error("Có sản phẩm không tồn tại");
        }

        for (const product of products) {
          if (product.status !== RECORD_STATUS.ACTIVE) {
            throw new Error(`Sản phẩm ${product.name} đang ngừng hoạt động`);
          }
        }

        const totalAmount = payload.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
        const code = await getUniquePurchaseOrderCode(tx);

        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            code,
            supplierId: payload.supplierId,
            userId,
            totalAmount,
            note: payload.note || null,
            status: "COMPLETED",
            items: {
              create: payload.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitCost: item.unitCost,
                lineTotal: item.quantity * item.unitCost,
              })),
            },
          },
        });

        for (const item of payload.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: { increment: item.quantity },
              costPrice: item.unitCost,
            },
          });

          await tx.stockTransaction.create({
            data: {
              productId: item.productId,
              userId,
              type: STOCK_TRANSACTION_TYPE.IMPORT,
              quantity: item.quantity,
              note: `Nhập kho theo phiếu ${purchaseOrder.code}`,
            },
          });
        }

        return tx.purchaseOrder.findUnique({
          where: { id: purchaseOrder.id },
          include: {
            supplier: true,
            user: { select: { id: true, fullName: true, email: true } },
            items: { include: { product: true } },
          },
        });
      });

      await createAuditLog({
        req: req as any,
        action: "STOCK_IN",
        entityType: "PURCHASE_ORDER",
        entityId: createdOrder!.id,
        metadata: { code: createdOrder!.code, totalAmount: payload.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) },
      });

      return res.status(201).json({
        success: true,
        message: "Tạo phiếu nhập thành công",
        data: formatPurchaseOrder(createdOrder),
      });
    } catch (error) {
      console.error("Create purchase order error:", error);
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Không thể tạo phiếu nhập",
      });
    }
  }
);

export default router;
