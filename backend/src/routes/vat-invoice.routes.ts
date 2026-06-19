import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { USER_ROLES } from "../constants/app.constants";

const router = Router();

const reviewSchema = z.object({
  redInvoiceCode: z.string().trim().max(100).optional(),
  adminNote: z.string().trim().max(500).optional(),
});

function getPagination(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function formatVatRequest(item: any) {
  return item;
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
      const status = String(req.query.status || "").toUpperCase();
      const search = String(req.query.search || "").trim();

      const where: any = {};

      if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { companyName: { contains: search, mode: "insensitive" } },
          { taxCode: { contains: search, mode: "insensitive" } },
          { order: { orderCode: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [items, totalItems] = await prisma.$transaction([
        prisma.vatInvoiceRequest.findMany({
          where,
          include: {
            order: {
              select: {
                id: true,
                orderCode: true,
                totalAmount: true,
                createdAt: true,
                customer: true,
              },
            },
          },
          orderBy: { requestedAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.vatInvoiceRequest.count({ where }),
      ]);

      return res.json({
        success: true,
        message: "Lấy danh sách yêu cầu VAT thành công",
        data: {
          items: items.map(formatVatRequest),
          pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          },
        },
      });
    } catch (error) {
      console.error("List VAT requests error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy danh sách yêu cầu VAT",
      });
    }
  }
);

router.patch(
  "/:id/approve",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const requestId = Number(req.params.id);
      const result = reviewSchema.safeParse(req.body);

      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID yêu cầu VAT không hợp lệ",
        });
      }

      if (!result.success || !result.data.redInvoiceCode) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng nhập mã hóa đơn đỏ",
        });
      }

      const updated = await prisma.vatInvoiceRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          redInvoiceCode: result.data.redInvoiceCode,
          adminNote: result.data.adminNote || null,
          reviewedAt: new Date(),
          reviewedById: Number((req as AuthRequest).user?.userId || 0),
        },
        include: {
          order: true,
        },
      });

      return res.json({
        success: true,
        message: "Duyệt yêu cầu VAT thành công",
        data: formatVatRequest(updated),
      });
    } catch (error) {
      console.error("Approve VAT request error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể duyệt yêu cầu VAT",
      });
    }
  }
);

router.patch(
  "/:id/reject",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const requestId = Number(req.params.id);
      const result = reviewSchema.safeParse(req.body);

      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID yêu cầu VAT không hợp lệ",
        });
      }

      const updated = await prisma.vatInvoiceRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          adminNote: result.success ? result.data.adminNote || null : null,
          reviewedAt: new Date(),
          reviewedById: Number((req as AuthRequest).user?.userId || 0),
        },
        include: {
          order: true,
        },
      });

      return res.json({
        success: true,
        message: "Hủy yêu cầu VAT thành công",
        data: formatVatRequest(updated),
      });
    } catch (error) {
      console.error("Reject VAT request error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể hủy yêu cầu VAT",
      });
    }
  }
);

export default router;
