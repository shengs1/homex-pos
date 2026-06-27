import { Router } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";
import { createAuditLog } from "../utils/audit";

const prisma = new PrismaClient();
const router = Router();

const promotionSchema = z.object({
  code: z.string().min(2).max(30).transform((value) => value.toUpperCase().trim()),
  name: z.string().nullable().optional(),
  discountType: z.enum(["AMOUNT", "PERCENT"]),
  discountValue: z.coerce.number().positive(),
  maxDiscountAmount: z.coerce.number().min(0).nullable().optional(),
  minOrderAmount: z.coerce.number().min(0).default(0),
  usageLimit: z.coerce.number().int().positive().nullable().optional(),
  customerLimit: z.coerce.number().int().positive().nullable().optional(),
  eligibleTiers: z.string().default("ALL"),
  startDate: z.coerce.date().optional(),
  expiredAt: z.coerce.date(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).refine(data => {
  if (data.discountType === "AMOUNT" && data.discountValue > data.minOrderAmount) {
    return false;
  }
  return true;
}, {
  message: "Mức giảm cố định không được lớn hơn đơn hàng tối thiểu.",
  path: ["discountValue"]
}).refine(data => {
  if (data.discountType === "PERCENT" && (data.discountValue < 1 || data.discountValue > 100)) {
    return false;
  }
  return true;
}, {
  message: "Mức giảm phần trăm phải từ 1 đến 100.",
  path: ["discountValue"]
});

const validatePromotionSchema = z.object({
  code: z.string().min(2).max(30).transform((value) => value.toUpperCase().trim()),
  subtotal: z.coerce.number().min(0),
  customerTier: z.string().nullable().optional(),
  customerId: z.coerce.number().nullable().optional(),
});

function isTierEligible(customerTier: string | null | undefined, eligibleTiers: string | null | undefined) {
  if (!eligibleTiers || eligibleTiers === "ALL") return true;
  const tiers = eligibleTiers.split(",").map((item) => item.trim()).filter(Boolean);
  if (tiers.includes("ALL")) return true;
  return tiers.includes(customerTier || "NONE");
}

function calculatePromotionDiscount(promotion: any, subtotal: number) {
  if (promotion.discountType === "PERCENT") {
    let discount = Math.floor((subtotal * promotion.discountValue) / 100);
    if (promotion.maxDiscountAmount && promotion.maxDiscountAmount > 0) {
      discount = Math.min(discount, Number(promotion.maxDiscountAmount));
    }
    return discount;
  }
  return Math.floor(promotion.discountValue);
}

router.use(authenticateToken);

router.get("/", authorizeRoles("ADMIN"), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    const where: any = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } }
      ];
    }
    if (status) {
      where.status = status;
    }

    const [items, totalItems] = await Promise.all([
      prisma.promotion.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.promotion.count({ where }),
    ]);

    res.json({
      success: true,
      message: "Lấy danh sách khuyến mãi thành công",
      data: {
        items,
        pagination: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", authorizeRoles("ADMIN"), async (req, res, next) => {
  try {
    const body = promotionSchema.parse(req.body);
    const promotion = await prisma.promotion.create({ data: body });

    await createAuditLog({
      req: req as any,
      action: "CREATE",
      entityType: "PROMOTION",
      entityId: promotion.id,
      metadata: { code: promotion.code, discountType: promotion.discountType, discountValue: promotion.discountValue },
    });

    res.status(201).json({ success: true, message: "Tạo mã khuyến mãi thành công", data: promotion });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", authorizeRoles("ADMIN"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = promotionSchema.parse(req.body);
    const promotion = await prisma.promotion.update({ where: { id }, data: body });

    await createAuditLog({
      req: req as any,
      action: "UPDATE",
      entityType: "PROMOTION",
      entityId: promotion.id,
      metadata: { code: promotion.code, discountType: promotion.discountType, discountValue: promotion.discountValue },
    });

    res.json({ success: true, message: "Cập nhật mã khuyến mãi thành công", data: promotion });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", authorizeRoles("ADMIN"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const promotion = await prisma.promotion.update({ where: { id }, data: { status: "INACTIVE" } });

    await createAuditLog({
      req: req as any,
      action: "DELETE",
      entityType: "PROMOTION",
      entityId: promotion.id,
      metadata: { code: promotion.code },
    });

    res.json({ success: true, message: "Xóa mã khuyến mãi thành công", data: promotion });
  } catch (error) {
    next(error);
  }
});

router.post("/validate", authorizeRoles("ADMIN", "CASHIER"), async (req, res, next) => {
  try {
    const { code, subtotal, customerTier, customerId } = validatePromotionSchema.parse(req.body);
    const promotion = await prisma.promotion.findUnique({ where: { code } });

    if (!promotion || promotion.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "Mã giảm giá không hợp lệ" });
    }

    if (new Date(promotion.startDate).getTime() > Date.now()) {
      return res.status(400).json({ success: false, message: "Mã giảm giá chưa đến thời gian áp dụng" });
    }

    if (new Date(promotion.expiredAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Mã giảm giá đã hết hạn" });
    }

    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
      return res.status(400).json({ success: false, message: "Mã giảm giá đã hết lượt sử dụng" });
    }

    if (!isTierEligible(customerTier, promotion.eligibleTiers)) {
      return res.status(400).json({ success: false, message: "Voucher không áp dụng cho hạng thành viên của khách hàng này" });
    }

    if (promotion.customerLimit && promotion.customerLimit > 0) {
      if (!customerId) {
        return res.status(400).json({ success: false, message: "Voucher này yêu cầu chọn khách hàng để áp dụng" });
      }
      const userUsageCount = await prisma.order.count({
        where: { customerId, promotionCode: promotion.code, status: "COMPLETED" },
      });
      if (userUsageCount >= promotion.customerLimit) {
        return res.status(400).json({ success: false, message: "Bạn đã hết lượt dùng mã giảm giá này" });
      }
    }

    if (subtotal < promotion.minOrderAmount) {
      return res.status(400).json({ success: false, message: "Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã" });
    }

    const discountAmount = Math.min(calculatePromotionDiscount(promotion, subtotal), subtotal);
    res.json({ success: true, message: "Áp dụng mã giảm giá thành công", data: { code, discountAmount, promotion } });
  } catch (error) {
    next(error);
  }
});

export default router;
