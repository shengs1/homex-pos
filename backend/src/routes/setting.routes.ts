import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";
import { USER_ROLES } from "../constants/app.constants";

const router = Router();

const settingSchema = z.object({
  storeName: z.string().trim().min(1, "Tên cửa hàng không được để trống").max(150),
  storeAddress: z.string().trim().max(300).optional().nullable(),
  storeHotline: z.string().trim().max(50).optional().nullable(),
  printPaperSize: z.string().trim().max(20).optional(),
  bankName: z.string().trim().max(100).optional().nullable(),
  bankAccountNumber: z.string().trim().max(50).optional().nullable(),
  bankAccountName: z.string().trim().max(150).optional().nullable(),
  vietQrTemplate: z.string().trim().max(500).optional().nullable(),
  minStock: z.coerce.number().int().min(0).optional(),
  maxDiscount: z.coerce.number().min(0).optional(),
});

async function getOrCreateSetting() {
  const setting = await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: "Homex POS",
      printPaperSize: "K80",
    },
  });

  return {
    ...setting,
    maxDiscount: Number(setting.maxDiscount),
  };
}

router.get(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.CASHIER),
  async (req, res) => {
    try {
      const setting = await getOrCreateSetting();

      return res.json({
        success: true,
        message: "Lấy cấu hình hệ thống thành công",
        data: setting,
      });
    } catch (error) {
      console.error("Get settings error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể lấy cấu hình hệ thống",
      });
    }
  }
);

router.put(
  "/",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  async (req, res) => {
    try {
      const result = settingSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error.issues[0]?.message || "Dữ liệu không hợp lệ",
        });
      }

      const data = result.data;
      const setting = await prisma.setting.upsert({
        where: { id: 1 },
        update: {
          storeName: data.storeName,
          storeAddress: data.storeAddress || null,
          storeHotline: data.storeHotline || null,
          printPaperSize: data.printPaperSize || "K80",
          bankName: data.bankName || null,
          bankAccountNumber: data.bankAccountNumber || null,
          bankAccountName: data.bankAccountName || null,
          vietQrTemplate: data.vietQrTemplate || null,
          minStock: data.minStock ?? 0,
          maxDiscount: data.maxDiscount ?? 0,
        },
        create: {
          id: 1,
          storeName: data.storeName,
          storeAddress: data.storeAddress || null,
          storeHotline: data.storeHotline || null,
          printPaperSize: data.printPaperSize || "K80",
          bankName: data.bankName || null,
          bankAccountNumber: data.bankAccountNumber || null,
          bankAccountName: data.bankAccountName || null,
          vietQrTemplate: data.vietQrTemplate || null,
          minStock: data.minStock ?? 0,
          maxDiscount: data.maxDiscount ?? 0,
        },
      });

      return res.json({
        success: true,
        message: "Cập nhật cấu hình hệ thống thành công",
        data: {
          ...setting,
          maxDiscount: Number(setting.maxDiscount),
        },
      });
    } catch (error) {
      console.error("Update settings error:", error);
      return res.status(500).json({
        success: false,
        message: "Không thể cập nhật cấu hình hệ thống",
      });
    }
  }
);

export default router;
