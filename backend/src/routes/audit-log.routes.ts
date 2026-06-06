import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";
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

function getAuditLogId(value: string) {
  const auditLogId = Number(value);

  if (!Number.isInteger(auditLogId) || auditLogId <= 0) {
    throw new AppError("ID nhật ký không hợp lệ", 400);
  }

  return auditLogId;
}

function getOptionalPositiveId(value: unknown, fieldName: string) {
  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new AppError(`${fieldName} không hợp lệ`, 400);
  }

  return numberValue;
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

function formatAuditLog(auditLog: AuditLogWithUser) {
  return {
    id: auditLog.id,
    userId: auditLog.userId,
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    description: auditLog.description,
    createdAt: auditLog.createdAt,
    user: auditLog.user,
  };
}

// GET /api/audit-logs?page=1&limit=10&search=&action=ORDER_CHECKOUT&entityType=Order&userId=1&fromDate=2026-01-01&toDate=2026-12-31
router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const page = getPaginationValue(req.query.page, 1);
    const limit = Math.min(getPaginationValue(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const action = String(req.query.action || "").trim();
    const entityType = String(req.query.entityType || "").trim();
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
      where.action = {
        equals: action,
        mode: "insensitive",
      };
    }

    if (entityType) {
      where.entityType = {
        equals: entityType,
        mode: "insensitive",
      };
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

    const [auditLogs, totalItems] = await prisma.$transaction([
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

    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      message: "Lấy danh sách nhật ký thao tác thành công",
      data: {
        items: auditLogs.map(formatAuditLog),
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

// GET /api/audit-logs/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const auditLogId = getAuditLogId(String(req.params.id));

    const auditLog = await prisma.auditLog.findUnique({
      where: {
        id: auditLogId,
      },
      include: auditLogInclude,
    });

    if (!auditLog) {
      throw new AppError("Không tìm thấy nhật ký thao tác", 404);
    }

    return res.json({
      success: true,
      message: "Lấy chi tiết nhật ký thao tác thành công",
      data: formatAuditLog(auditLog),
    });
  })
);

export default router;