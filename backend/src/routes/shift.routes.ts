import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { USER_ROLES } from "../constants/app.constants";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { 
  autoCloseExpiredShifts, 
  ensureNoOpenShift, 
  ensureWithinBusinessHours, 
  formatShiftWithStats, 
  ensureShiftCapacity
} from "../services/shift.service";
import { createAuditLog } from "../utils/audit";

const router = Router();

function getUserId(req: AuthRequest) {
  return Number(req.user?.userId || 0);
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

const openShiftSchema = z.object({
  openingCash: z.coerce.number().min(0, "Tiền đầu ca không hợp lệ"),
  shiftType: z.enum(["MORNING", "EVENING"]),
  userId: z.coerce.number().positive("Vui lòng chọn nhân viên cần mở ca"),
  note: z.string().trim().max(500).optional(),
});

const closeShiftSchema = z.object({
  closingCash: z.coerce.number().min(0, "Tiền cuối ca không hợp lệ"),
  note: z.string().trim().max(500).optional(),
});

function getPagination(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

router.get(
  "/current",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    await autoCloseExpiredShifts();
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
      data: shift ? await formatShiftWithStats(shift, formatShift) : null,
    });
  })
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  catchAsync(async (req, res) => {
    await autoCloseExpiredShifts();
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

    const scopeWhere = authReq.user?.role === USER_ROLES.CASHIER ? { userId: getUserId(authReq) } : {};

    const [items, totalItems, totalScopeItems, openShifts, closedShifts, closedShiftsAgg, openShiftItems] = await prisma.$transaction([
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
      prisma.shift.count({ where: scopeWhere }),
      prisma.shift.count({ where: { ...scopeWhere, status: "OPEN" } }),
      prisma.shift.count({ where: { ...scopeWhere, status: "CLOSED" } }),
      prisma.shift.aggregate({
        where: { ...scopeWhere, status: "CLOSED" },
        _sum: { discrepancyAmount: true },
      }),
      prisma.shift.findMany({
        where: { ...scopeWhere, status: "OPEN" },
      }),
    ]);

    const openShiftStats = await Promise.all(openShiftItems.map((shift) => formatShiftWithStats(shift, formatShift)));
    const totalCashInDrawer = openShiftStats.reduce((sum, shift) => sum + Number(shift.expectedCash || 0), 0);

    return res.json({
      success: true,
      message: "Lấy danh sách ca thành công",
      data: {
        items: await Promise.all(items.map(s => formatShiftWithStats(s, formatShift))),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        },
        summary: {
          totalShifts: totalScopeItems,
          openShifts,
          closedShifts,
          totalCashInDrawer,
          totalDifference: closedShiftsAgg._sum.discrepancyAmount || 0,
        },
      },
    });
  })
);

router.post(
  "/open",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const result = openShiftSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      ensureWithinBusinessHours();
      await ensureShiftCapacity(result.data.shiftType);

      const targetUserId = result.data.userId;

      await ensureNoOpenShift(targetUserId);

      const shift = await prisma.shift.create({
        data: {
          userId: targetUserId,
          openingCash: result.data.openingCash,
          shiftType: result.data.shiftType,
          note: result.data.note || null,
          status: "OPEN",
        },
      });

      await createAuditLog({
        req: req as any,
        action: "SHIFT_OPEN",
        entityType: "SHIFT",
        entityId: shift.id,
        metadata: { type: shift.shiftType, openingCash: shift.openingCash.toNumber() },
      });

      return res.status(201).json({
        success: true,
        message: "Mở ca thành công",
        data: await formatShiftWithStats(shift, formatShift),
      });
    } catch (error) {
      console.error("Open shift error:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
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

      const stats = await formatShiftWithStats(shift, formatShift);
      const expectedCash = stats.expectedCash;
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

      await createAuditLog({
        req: req as any,
        action: "SHIFT_CLOSE",
        entityType: "SHIFT",
        entityId: updatedShift.id,
        metadata: { discrepancy: discrepancyAmount },
      });

      return res.json({
        success: true,
        message: "Đóng ca thành công",
        data: await formatShiftWithStats(updatedShift, formatShift),
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
