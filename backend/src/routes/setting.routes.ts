import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";
import { USER_ROLES } from "../constants/app.constants";
import { createAuditLog } from "../utils/audit";

const router = Router();

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const settingSchema = z.object({
  storeName: z.string().trim().min(1).max(150),
  storeBranch: optionalText(150),
  taxCode: optionalText(50),
  businessHours: optionalText(150),
  currency: z.string().trim().max(10).optional(),
  storeAddress: optionalText(300),
  storeHotline: optionalText(50),
  printPaperSize: z.string().trim().max(20).optional(),
  printCopies: z.coerce.number().int().min(1).max(10).optional(),
  autoOpenPrint: z.coerce.boolean().optional(),
  requireCustomerPhone: z.coerce.boolean().optional(),
  bankName: optionalText(100),
  bankAccountNumber: optionalText(50),
  bankAccountName: optionalText(150),
  vietQrTemplate: optionalText(500),
  transferContentTemplate: optionalText(150),
  defaultPaymentMethod: z.string().trim().max(20).optional(),
  productsPerPage: z.coerce.number().int().min(4).max(200).optional(),
  autoLockMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  allowOrderDiscount: z.coerce.boolean().optional(),
  confirmBeforeCheckout: z.coerce.boolean().optional(),
  barcodeAutoAdd: z.coerce.boolean().optional(),
  compactPosMode: z.coerce.boolean().optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  warnLowStockSale: z.coerce.boolean().optional(),
  maxDiscount: z.coerce.number().min(0).optional(),
  maxEmployeesPerShift: z.coerce.number().int().min(1).max(20).optional(),
  vatEmailEnabled: z.coerce.boolean().optional(),
  smtpHost: optionalText(150),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser: optionalText(150),
  smtpPassword: optionalText(150),
});

function normalizeOptionalText(value?: string | null) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";
  return trimmedValue || null;
}

function formatSetting(setting: Awaited<ReturnType<typeof prisma.setting.upsert>>) {
  return {
    ...setting,
    maxDiscount: Number(setting.maxDiscount),
  };
}

async function getOrCreateSetting() {
  const setting = await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: "Homex POS",
      printPaperSize: "K80",
      currency: "VND",
      defaultPaymentMethod: "CASH",
    },
  });

  return formatSetting(setting);
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
        message: "Settings loaded successfully",
        data: setting,
      });
    } catch (error) {
      console.error("Get settings error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to load settings",
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
          message: result.error.issues[0]?.message || "Invalid data",
        });
      }

      const data = result.data;
      const payload = {
        storeName: data.storeName,
        storeBranch: normalizeOptionalText(data.storeBranch),
        taxCode: normalizeOptionalText(data.taxCode),
        businessHours: normalizeOptionalText(data.businessHours),
        currency: data.currency || "VND",
        storeAddress: normalizeOptionalText(data.storeAddress),
        storeHotline: normalizeOptionalText(data.storeHotline),
        printPaperSize: data.printPaperSize || "K80",
        printCopies: data.printCopies ?? 1,
        autoOpenPrint: data.autoOpenPrint ?? false,
        requireCustomerPhone: data.requireCustomerPhone ?? false,
        bankName: normalizeOptionalText(data.bankName),
        bankAccountNumber: normalizeOptionalText(data.bankAccountNumber),
        bankAccountName: normalizeOptionalText(data.bankAccountName),
        vietQrTemplate: normalizeOptionalText(data.vietQrTemplate),
        transferContentTemplate: normalizeOptionalText(data.transferContentTemplate),
        defaultPaymentMethod: data.defaultPaymentMethod || "CASH",
        productsPerPage: data.productsPerPage ?? 24,
        autoLockMinutes: data.autoLockMinutes ?? 30,
        allowOrderDiscount: data.allowOrderDiscount ?? true,
        confirmBeforeCheckout: data.confirmBeforeCheckout ?? true,
        barcodeAutoAdd: data.barcodeAutoAdd ?? true,
        compactPosMode: data.compactPosMode ?? false,
        minStock: data.minStock ?? 0,
        warnLowStockSale: data.warnLowStockSale ?? true,
        maxDiscount: data.maxDiscount ?? 0,
        maxEmployeesPerShift: data.maxEmployeesPerShift ?? 1,
        vatEmailEnabled: data.vatEmailEnabled ?? false,
        smtpHost: normalizeOptionalText(data.smtpHost),
        smtpPort: data.smtpPort ?? 587,
        smtpUser: normalizeOptionalText(data.smtpUser),
        smtpPassword: normalizeOptionalText(data.smtpPassword),
      };

      const setting = await prisma.setting.upsert({
        where: { id: 1 },
        update: payload,
        create: {
          id: 1,
          ...payload,
        },
      });

      await createAuditLog({
        req: req as any,
        action: "SETTINGS_UPDATE",
        entityType: "SETTINGS",
        entityId: 1,
        description: "Cập nhật cài đặt hệ thống",
        metadata: payload,
      });

      return res.json({
        success: true,
        message: "Settings updated successfully",
        data: formatSetting(setting),
      });
    } catch (error) {
      console.error("Update settings error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to update settings",
      });
    }
  }
);

export default router;
