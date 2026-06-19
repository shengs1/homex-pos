import { Router } from "express";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { RECORD_STATUS, USER_ROLES } from "../constants/app.constants";

const router = Router();

function getPagination(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

async function syncLowStockNotifications() {
  const lowStockProducts = await prisma.product.findMany({
    where: {
      status: RECORD_STATUS.ACTIVE,
      stockQuantity: {
        lte: prisma.product.fields.minStock,
      },
    },
    take: 20,
    orderBy: {
      updatedAt: "desc",
    },
  });

  for (const product of lowStockProducts) {
    const existing = await prisma.notification.findFirst({
      where: {
        type: "LOW_STOCK",
        targetRole: USER_ROLES.ADMIN,
        message: {
          contains: product.sku,
          mode: "insensitive",
        },
      },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          type: "LOW_STOCK",
          title: "Cảnh báo tồn kho thấp",
          message: `${product.sku} - ${product.name} còn ${product.stockQuantity}/${product.minStock}`,
          targetRole: USER_ROLES.ADMIN,
        },
      });
    }
  }
}

function buildNotificationWhere(authReq: AuthRequest) {
  const role = authReq.user?.role || "";
  const userId = Number(authReq.user?.userId || 0);

  return {
    OR: [
      { userId },
      { userId: null, targetRole: null },
      { userId: null, targetRole: role },
    ],
  };
}

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const authReq = req as AuthRequest;

      if (authReq.user?.role === USER_ROLES.ADMIN) {
        await syncLowStockNotifications();
      }

      const page = getPagination(req.query.page, 1);
      const limit = Math.min(getPagination(req.query.limit, 10), 50);
      const skip = (page - 1) * limit;
      const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";
      const where: any = buildNotificationWhere(authReq);

      if (unreadOnly) {
        where.isRead = false;
      }

      const [items, totalItems, unreadCount] = await prisma.$transaction([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
          where: {
            ...buildNotificationWhere(authReq),
            isRead: false,
          },
        }),
      ]);

      return res.json({
        success: true,
        message: "Lấy thông báo thành công",
        data: {
          items,
          unreadCount,
          pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          },
        },
      });
    } catch (error) {
      console.error("List notifications error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy thông báo",
      });
    }
  }
);

router.patch(
  "/:id/read",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const notificationId = Number(req.params.id);

      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID thông báo không hợp lệ",
        });
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Đã đọc thông báo",
        data: updated,
      });
    } catch (error) {
      console.error("Read notification error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật thông báo",
      });
    }
  }
);

router.patch(
  "/read-all",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const result = await prisma.notification.updateMany({
        where: {
          ...buildNotificationWhere(authReq),
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Đã đọc tất cả thông báo",
        data: result,
      });
    } catch (error) {
      console.error("Read all notifications error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật thông báo",
      });
    }
  }
);

export default router;
