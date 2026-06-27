import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles, AuthRequest } from "../middlewares/auth.middleware";
import { ORDER_STATUS, USER_ROLES } from "../constants/app.constants";
import { lookupTaxCode } from "../services/taxLookup.service";
import { createAuditLog } from "../utils/audit";
import { sendVatEmail } from "../services/email.service";

const router = Router();

const reviewSchema = z.object({
  redInvoiceCode: z.string().trim().max(100).optional(),
  adminNote: z.string().trim().max(500).optional(),
});

const vatRequestSchema = z.object({
  orderCode: z.string().trim().min(1, "Mã hóa đơn không được để trống"),
  companyName: z.string().trim().min(1, "Tên công ty không được để trống").max(200),
  taxCode: z.string().trim().min(1, "Mã số thuế không được để trống").max(50),
  companyAddress: z.string().trim().max(300).optional(),
  buyerEmail: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
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

router.get(
  "/tax-lookup",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const taxCode = String(req.query.taxCode || "").trim();
      if (!taxCode) {
        return res.status(400).json({ success: false, message: "Vui lòng cung cấp mã số thuế" });
      }

      const result = await lookupTaxCode(taxCode);
      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error("Tax lookup route error:", error);
      return res.status(500).json({ success: false, message: "Không thể tra cứu mã số thuế" });
    }
  }
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const result = vatRequestSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const { orderCode, companyName, taxCode, companyAddress, buyerEmail, note } = result.data;

      const order = await prisma.order.findUnique({
        where: { orderCode },
        include: { vatInvoiceRequest: true },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: "Không tìm thấy hóa đơn" });
      }

      if (order.status === ORDER_STATUS.CANCELLED) {
        return res.status(400).json({ success: false, message: "Hóa đơn đã hủy, không thể xuất VAT" });
      }

      if (order.status !== ORDER_STATUS.COMPLETED) {
        return res.status(400).json({ success: false, message: "Hóa đơn chưa thanh toán/hoàn tất, không thể xuất VAT" });
      }

      if (order.vatInvoiceRequest) {
        if (order.vatInvoiceRequest.status === "PENDING") {
          return res.status(409).json({ success: false, message: "Hóa đơn này đã có yêu cầu VAT đang chờ xử lý" });
        }
        if (order.vatInvoiceRequest.status === "APPROVED") {
          return res.status(409).json({ success: false, message: "Hóa đơn này đã được xuất VAT" });
        }
      }

      const vatRequest = await prisma.$transaction(async (tx) => {
        let upserted;
        if (order.vatInvoiceRequest) {
          upserted = await tx.vatInvoiceRequest.update({
            where: { id: order.vatInvoiceRequest.id },
            data: {
              companyName,
              taxCode,
              companyAddress: companyAddress || "",
              buyerEmail: buyerEmail || null,
              note: note || null,
              status: "PENDING",
              redInvoiceCode: null,
              adminNote: null,
              requestedAt: new Date(),
            },
            include: { order: true },
          });
        } else {
          upserted = await tx.vatInvoiceRequest.create({
            data: {
              orderId: order.id,
              companyName,
              taxCode,
              companyAddress: companyAddress || "",
              buyerEmail: buyerEmail || null,
              note: note || null,
            },
            include: { order: true },
          });
        }

        await tx.notification.create({
          data: {
            type: "VAT_REQUEST",
            title: "Yêu cầu hóa đơn VAT mới",
            message: `Hóa đơn ${order.orderCode} vừa gửi yêu cầu VAT từ hệ thống`,
            targetRole: "ADMIN",
          },
        });

        return upserted;
      });

      await createAuditLog({
        req: req as any,
        action: "VAT_CREATE",
        entityType: "VAT_INVOICE",
        entityId: vatRequest.id,
        metadata: { taxCode, companyName },
      });

      return res.status(201).json({
        success: true,
        message: "Tạo yêu cầu VAT thành công",
        data: formatVatRequest(vatRequest),
      });
    } catch (error) {
      console.error("Create VAT request error:", error);
      return res.status(500).json({ success: false, message: "Không thể tạo yêu cầu VAT" });
    }
  }
);

router.post(
  "/:id/resend-email",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ success: false, message: "ID yêu cầu VAT không hợp lệ" });
    }
    // Retrieve setting from DB
    const setting = await prisma.setting.findUnique({
      where: { id: 1 },
    });
    
    const hasEmailService = !!setting?.vatEmailEnabled && !!setting?.smtpHost && !!setting?.smtpUser;
    
    if (!hasEmailService) {
      return res.status(400).json({
        success: false,
        message: "Chưa cấu hình dịch vụ gửi email.",
      });
    }

    const requestItem = await prisma.vatInvoiceRequest.findUnique({
      where: { id: requestId },
      include: { order: true },
    });

    if (!requestItem) {
      return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu VAT" });
    }

    if (!requestItem.buyerEmail) {
      return res.status(400).json({ success: false, message: "Yêu cầu này không có email người nhận" });
    }

    try {
      await sendVatEmail(setting as any, requestItem);
      
      await createAuditLog({
        req: req as any,
        action: "VAT_RESEND_EMAIL",
        entityType: "VAT_INVOICE",
        entityId: requestItem.id,
        metadata: { to: requestItem.buyerEmail },
      });

      return res.json({ success: true, message: "Đã gửi lại email thành công" });
    } catch (error: any) {
      console.error("Resend VAT email error:", error);
      return res.status(500).json({ success: false, message: error.message || "Gửi email thất bại" });
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

      await createAuditLog({
        req: req as any,
        action: "VAT_APPROVE",
        entityType: "VAT_INVOICE",
        entityId: updated.id,
        metadata: { redInvoiceCode: updated.redInvoiceCode },
      });

      // Automatically send email if configured
      const setting = await prisma.setting.findUnique({ where: { id: 1 } });
      const hasEmailService = !!setting?.vatEmailEnabled && !!setting?.smtpHost && !!setting?.smtpUser;
      if (hasEmailService && updated.buyerEmail) {
        try {
          await sendVatEmail(setting as any, updated);
        } catch (emailError) {
          console.error("Auto send VAT email on approve error:", emailError);
        }
      }

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

      await createAuditLog({
        req: req as any,
        action: "VAT_REJECT",
        entityType: "VAT_INVOICE",
        entityId: updated.id,
        metadata: { note: updated.adminNote },
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

const adjustSchema = z.object({
  companyName: z.string().trim().min(1, "Tên công ty không được để trống").max(200).optional(),
  taxCode: z.string().trim().min(1, "Mã số thuế không được để trống").max(50).optional(),
  companyAddress: z.string().trim().max(300).optional(),
  buyerEmail: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")).nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  redInvoiceCode: z.string().trim().max(100).optional().nullable(),
  adminNote: z.string().trim().max(500).optional().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

router.put(
  "/:id/adjust",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const requestId = Number(req.params.id);
      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({ success: false, message: "ID yêu cầu VAT không hợp lệ" });
      }

      const result = adjustSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const existing = await prisma.vatInvoiceRequest.findUnique({
        where: { id: requestId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu VAT" });
      }

      const data = result.data;
      const updated = await prisma.vatInvoiceRequest.update({
        where: { id: requestId },
        data: {
          companyName: data.companyName !== undefined ? data.companyName : undefined,
          taxCode: data.taxCode !== undefined ? data.taxCode : undefined,
          companyAddress: data.companyAddress !== undefined ? data.companyAddress : undefined,
          buyerEmail: data.buyerEmail !== undefined ? (data.buyerEmail || null) : undefined,
          note: data.note !== undefined ? (data.note || null) : undefined,
          redInvoiceCode: data.redInvoiceCode !== undefined ? (data.redInvoiceCode || null) : undefined,
          adminNote: data.adminNote !== undefined ? (data.adminNote || null) : undefined,
          status: data.status !== undefined ? data.status : undefined,
          reviewedAt: data.status !== undefined && data.status !== "PENDING" ? new Date() : undefined,
          reviewedById: data.status !== undefined && data.status !== "PENDING" ? Number((req as AuthRequest).user?.userId || 0) : undefined,
        },
        include: {
          order: true,
        },
      });

      await createAuditLog({
        req: req as any,
        action: "VAT_ADJUST",
        entityType: "VAT_INVOICE",
        entityId: updated.id,
        metadata: { old: existing, new: updated },
      });

      // Automatically send/resend email if status is APPROVED and vatEmailEnabled is active
      if (updated.status === "APPROVED") {
        const setting = await prisma.setting.findUnique({ where: { id: 1 } });
        const hasEmailService = !!setting?.vatEmailEnabled && !!setting?.smtpHost && !!setting?.smtpUser;
        if (hasEmailService && updated.buyerEmail) {
          try {
            await sendVatEmail(setting as any, updated);
          } catch (emailError) {
            console.error("Auto send/resend VAT email on adjust error:", emailError);
          }
        }
      }

      return res.json({
        success: true,
        message: "Điều chỉnh yêu cầu VAT thành công",
        data: formatVatRequest(updated),
      });
    } catch (error) {
      console.error("Adjust VAT request error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể điều chỉnh yêu cầu VAT",
      });
    }
  }
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const requestId = Number(req.params.id);
      if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({ success: false, message: "ID yêu cầu VAT không hợp lệ" });
      }

      const deleted = await prisma.vatInvoiceRequest.delete({
        where: { id: requestId },
      });

      await createAuditLog({
        req: req as any,
        action: "VAT_DELETE",
        entityType: "VAT_INVOICE",
        entityId: deleted.id,
        metadata: { companyName: deleted.companyName, taxCode: deleted.taxCode },
      });

      return res.json({
        success: true,
        message: "Xóa yêu cầu VAT thành công",
      });
    } catch (error) {
      console.error("Delete VAT request error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể xóa yêu cầu VAT",
      });
    }
  }
);

export default router;
