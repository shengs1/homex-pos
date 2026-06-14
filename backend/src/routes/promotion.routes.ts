import { Router } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";

const prisma = new PrismaClient();
const router = Router();

const promotionSchema = z.object({
  code: z.string().min(2).max(30).transform((value) => value.toUpperCase().trim()),
  discountType: z.enum(["AMOUNT", "PERCENT"]),
  discountValue: z.coerce.number().positive(),
  minOrderAmount: z.coerce.number().min(0).default(0),
  usageLimit: z.coerce.number().int().positive().nullable().optional(),
  expiredAt: z.coerce.date(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const validatePromotionSchema = z.object({
  code: z.string().min(2).max(30).transform((value) => value.toUpperCase().trim()),
  subtotal: z.coerce.number().min(0),
});

function calculatePromotionDiscount(promotion: any, subtotal: number) {
  if (promotion.discountType === "PERCENT") {
    return Math.floor((subtotal * promotion.discountValue) / 100);
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
      where.code = { contains: search, mode: "insensitive" };
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
    res.json({ success: true, message: "Cập nhật mã khuyến mãi thành công", data: promotion });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", authorizeRoles("ADMIN"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const promotion = await prisma.promotion.update({ where: { id }, data: { status: "INACTIVE" } });
    res.json({ success: true, message: "Xóa mã khuyến mãi thành công", data: promotion });
  } catch (error) {
    next(error);
  }
});

router.post("/validate", authorizeRoles("ADMIN", "CASHIER"), async (req, res, next) => {
  try {
    const { code, subtotal } = validatePromotionSchema.parse(req.body);
    const promotion = await prisma.promotion.findUnique({ where: { code } });

    if (!promotion || promotion.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "Mã giảm giá không hợp lệ" });
    }

    if (new Date(promotion.expiredAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Mã giảm giá đã hết hạn" });
    }

    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
      return res.status(400).json({ success: false, message: "Mã giảm giá đã hết lượt sử dụng" });
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
