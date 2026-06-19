import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { PAYMENT_METHOD, PAYMENT_STATUS, USER_ROLES } from "../constants/app.constants";

const router = Router();

const openShiftSchema = z.object({
  openingCash: z.coerce.number().min(0, "Tiền đầu ca không hợp lệ"),
  note: z.string().trim().max(500).optional(),
});

const closeShiftSchema = z.object({
  closingCash: z.coerce.number().min(0, "Tiền cuối ca không hợp lệ"),
  note: z.string().trim().max(500).optional(),
});

function getUserId(req: AuthRequest) {
  return Number(req.user?.userId || 0);
}

function getPagination(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function formatShift(shift: any) {
  return {
    ...shift,
    openingCash: Number(shift.openingCash),
    closingCash: shift.closingCash === null ? null : Number(shift.closingCash),
    expectedCash: shift.expectedCash === null ? null : Number(shift.expectedCash),
    discrepancyAmount: shift.discrepancyAmount === null ? null : Number(shift.discrepancyAmount),
  };
}

async function calculateExpectedCash(shiftId: number, openingCash: number) {
  const cashPayments = await prisma.payment.aggregate({
    where: {
      status: PAYMENT_STATUS.PAID,
      method: PAYMENT_METHOD.CASH,
      order: {
        shiftId,
      },
    },
    _sum: {
      amount: true,
    },
  });

  return openingCash + Number(cashPayments._sum.amount || 0);
}

router.get(
  "/current",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const userId = getUserId(req as AuthRequest);
      const shift = await prisma.shift.findFirst({
        where: {
          userId,
          status: "OPEN",
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: {
          openedAt: "desc",
        },
      });

      return res.json({
        success: true,
        message: "Lấy ca hiện tại thành công",
        data: shift ? formatShift(shift) : null,
      });
    } catch (error) {
      console.error("Get current shift error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy ca hiện tại",
      });
    }
  }
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const page = getPagination(req.query.page, 1);
      const limit = Math.min(getPagination(req.query.limit, 10), 100);
      const skip = (page - 1) * limit;
      const status = String(req.query.status || "").toUpperCase();

      const where: any = {};

      if (authReq.user?.role === USER_ROLES.CASHIER) {
        where.userId = getUserId(authReq);
      }

      if (status === "OPEN" || status === "CLOSED") {
        where.status = status;
      }

      const [items, totalItems] = await prisma.$transaction([
        prisma.shift.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: {
            openedAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.shift.count({ where }),
      ]);

      return res.json({
        success: true,
        message: "Lấy danh sách ca thành công",
        data: {
          items: items.map(formatShift),
          pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          },
        },
      });
    } catch (error) {
      console.error("List shifts error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy danh sách ca",
      });
    }
  }
);

router.post(
  "/open",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const result = openShiftSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const userId = getUserId(req as AuthRequest);
      const openShift = await prisma.shift.findFirst({
        where: {
          userId,
          status: "OPEN",
        },
      });

      if (openShift) {
        return res.status(400).json({
          success: false,
          message: "Bạn đang có ca mở",
        });
      }

      const shift = await prisma.shift.create({
        data: {
          userId,
          openingCash: result.data.openingCash,
          note: result.data.note || null,
          status: "OPEN",
        },
      });

      return res.status(201).json({
        success: true,
        message: "Mở ca thành công",
        data: formatShift(shift),
      });
    } catch (error) {
      console.error("Open shift error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể mở ca",
      });
    }
  }
);

router.patch(
  "/:id/close",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const result = closeShiftSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const shiftId = Number(req.params.id);
      const authReq = req as AuthRequest;

      if (!Number.isInteger(shiftId) || shiftId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID ca không hợp lệ",
        });
      }

      const shift = await prisma.shift.findUnique({ where: { id: shiftId } });

      if (!shift) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy ca",
        });
      }

      if (shift.status !== "OPEN") {
        return res.status(400).json({
          success: false,
          message: "Ca đã đóng",
        });
      }

      if (authReq.user?.role === USER_ROLES.CASHIER && shift.userId !== getUserId(authReq)) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền đóng ca này",
        });
      }

      const expectedCash = await calculateExpectedCash(shift.id, Number(shift.openingCash));
      const discrepancyAmount = result.data.closingCash - expectedCash;
      const updatedShift = await prisma.shift.update({
        where: { id: shift.id },
        data: {
          closingCash: result.data.closingCash,
          expectedCash,
          discrepancyAmount,
          note: result.data.note || shift.note,
          status: "CLOSED",
          closedAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Đóng ca thành công",
        data: formatShift(updatedShift),
      });
    } catch (error) {
      console.error("Close shift error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể đóng ca",
      });
    }
  }
);

export default router;
