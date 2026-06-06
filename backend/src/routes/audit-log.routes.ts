import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";
import { USER_ROLES } from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

const auditLogInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.AuditLogInclude;

type AuditLogWithUser = Prisma.AuditLogGetPayload<{
  include: typeof auditLogInclude;
}>;

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

function getOptionalPositiveId(value: unknown, fieldName: string) {
  if (!value) {
    return null;
  }

  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${fieldName} không hợp lệ`, 400);
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

function formatAuditLog(log: AuditLogWithUser) {
  return {
    id: log.id,
    userId: log.userId,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    description: log.description,
    createdAt: log.createdAt,
    user: log.user,
  };
}

// GET /api/audit-logs?page=1&limit=10&search=&action=CHECKOUT_ORDER&entityType=ORDER&userId=1&fromDate=2026-01-01&toDate=2026-12-31
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const action = String(req.query.action || "").trim().toUpperCase();
    const entityType = String(req.query.entityType || "").trim().toUpperCase();
    const userId = getOptionalPositiveId(req.query.userId, "ID người dùng");
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");

    const where: Prisma.AuditLogWhereInput = {};

    if (search) {
      where.OR = [
        {
          action: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          entityType: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          user: {
            fullName: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          user: {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (userId) {
      where.userId = userId;
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

    const [logs, totalItems] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: auditLogInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({
        where,
      }),
    ]);

    return res.json({
      success: true,
      message: "Lấy lịch sử thao tác thành công",
      data: {
        items: logs.map(formatAuditLog),
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

// GET /api/audit-logs/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const logId = getPositiveId(
      String(req.params.id),
      "ID lịch sử thao tác không hợp lệ"
    );

    const log = await prisma.auditLog.findUnique({
      where: {
        id: logId,
      },
      include: auditLogInclude,
    });

    if (!log) {
      throw new AppError("Không tìm thấy lịch sử thao tác", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết lịch sử thao tác thành công",
      data: formatAuditLog(log),
    });
  })
);

export default router;