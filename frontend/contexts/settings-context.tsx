"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAuthToken } from "@/lib/auth";
import { settingService, type SettingPayload } from "@/services/homex.service";

type SettingsContextValue = {
  settings: SettingPayload | null;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const FALLBACK_SETTINGS: SettingPayload = {
  storeName: "Homex POS",
  storeBranch: "",
  taxCode: "",
  businessHours: "",
  currency: "VND",
  storeAddress: "",
  storeHotline: "",
  printPaperSize: "K80",
  printCopies: 1,
  autoOpenPrint: false,
  requireCustomerPhone: false,
  bankName: "",
  bankAccountNumber: "",
  bankAccountName: "",
  vietQrTemplate: "",
  transferContentTemplate: "",
  defaultPaymentMethod: "CASH",
  productsPerPage: 24,
  autoLockMinutes: 30,
  allowOrderDiscount: true,
  confirmBeforeCheckout: true,
  barcodeAutoAdd: true,
  compactPosMode: false,
  minStock: 0,
  warnLowStockSale: true,
  allowOversell: false,
  maxDiscount: 0,
  maxEmployeesPerShift: 1,
  vatEmailEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
};

function normalizeSettings(data: Partial<SettingPayload>): SettingPayload {
  return {
    storeName: data.storeName || FALLBACK_SETTINGS.storeName,
    storeBranch: data.storeBranch || FALLBACK_SETTINGS.storeBranch,
    taxCode: data.taxCode || FALLBACK_SETTINGS.taxCode,
    businessHours: data.businessHours || FALLBACK_SETTINGS.businessHours,
    currency: data.currency || FALLBACK_SETTINGS.currency,
    storeAddress: data.storeAddress || FALLBACK_SETTINGS.storeAddress,
    storeHotline: data.storeHotline || FALLBACK_SETTINGS.storeHotline,
    printPaperSize: data.printPaperSize || FALLBACK_SETTINGS.printPaperSize,
    printCopies: data.printCopies || FALLBACK_SETTINGS.printCopies,
    autoOpenPrint: Boolean(data.autoOpenPrint),
    requireCustomerPhone: Boolean(data.requireCustomerPhone),
    bankName: data.bankName || FALLBACK_SETTINGS.bankName,
    bankAccountNumber: data.bankAccountNumber || FALLBACK_SETTINGS.bankAccountNumber,
    bankAccountName: data.bankAccountName || FALLBACK_SETTINGS.bankAccountName,
    vietQrTemplate: data.vietQrTemplate || FALLBACK_SETTINGS.vietQrTemplate,
    transferContentTemplate: data.transferContentTemplate || FALLBACK_SETTINGS.transferContentTemplate,
    defaultPaymentMethod: data.defaultPaymentMethod || FALLBACK_SETTINGS.defaultPaymentMethod,
    productsPerPage: data.productsPerPage || FALLBACK_SETTINGS.productsPerPage,
    autoLockMinutes: data.autoLockMinutes || FALLBACK_SETTINGS.autoLockMinutes,
    allowOrderDiscount: data.allowOrderDiscount ?? FALLBACK_SETTINGS.allowOrderDiscount,
    confirmBeforeCheckout: data.confirmBeforeCheckout ?? FALLBACK_SETTINGS.confirmBeforeCheckout,
    barcodeAutoAdd: data.barcodeAutoAdd ?? FALLBACK_SETTINGS.barcodeAutoAdd,
    compactPosMode: Boolean(data.compactPosMode),
    minStock: data.minStock || FALLBACK_SETTINGS.minStock,
    warnLowStockSale: data.warnLowStockSale ?? FALLBACK_SETTINGS.warnLowStockSale,
    allowOversell: Boolean(data.allowOversell),
    maxDiscount: data.maxDiscount || FALLBACK_SETTINGS.maxDiscount,
    maxEmployeesPerShift: data.maxEmployeesPerShift || FALLBACK_SETTINGS.maxEmployeesPerShift,
    vatEmailEnabled: Boolean(data.vatEmailEnabled),
    smtpHost: data.smtpHost || "",
    smtpPort: data.smtpPort || 587,
    smtpUser: data.smtpUser || "",
    smtpPassword: data.smtpPassword || "",
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    if (!getAuthToken()) {
      setSettings(FALLBACK_SETTINGS);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const data = await settingService.get();
      setSettings(normalizeSettings(data));
    } catch (error: any) {
      if (error?.response?.status !== 401) {
        console.error("Failed to load settings", error);
      }
      setSettings(FALLBACK_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    window.addEventListener("homex-pos:auth-changed", loadSettings);

    return () => {
      window.removeEventListener("homex-pos:auth-changed", loadSettings);
    };
  }, [loadSettings]);

  const value = useMemo(
    () => ({ settings, isLoading, refreshSettings: loadSettings }),
    [isLoading, loadSettings, settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}