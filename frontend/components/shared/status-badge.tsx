"use client";

import { useLanguage } from "@/contexts/language-context";
import type { OrderStatus, PaymentStatus, RecordStatus, StockTransactionType, UserStatus, WarrantyStatus } from "@/types/domain";

type KnownStatus = RecordStatus | UserStatus | OrderStatus | PaymentStatus | WarrantyStatus | StockTransactionType | string | null | undefined;

const statusAliasMap: Record<string, string> = {
  COMPLETE: "COMPLETED",
  COMPLETED: "COMPLETED",
  SUCCESS: "SUCCESS",
  SUCCEEDED: "SUCCESS",
  CANCEL: "CANCELLED",
  CANCELED: "CANCELLED",
  CANCELLED: "CANCELLED",
  REFUND: "REFUNDED",
  REFUNDED: "REFUNDED",
  PAID: "PAID",
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  LOCKED: "LOCKED",
  IMPORT: "IMPORT",
  SALE: "SALE",
  ADJUSTMENT: "ADJUSTMENT",
  RESTORE: "RESTORE",
};

function normalizeStatus(status: KnownStatus) {
  const rawStatus = String(status || "").trim().toUpperCase();
  return statusAliasMap[rawStatus] || rawStatus;
}

export function StatusBadge({ status }: { status: KnownStatus }) {
  const { t } = useLanguage();
  const normalizedStatus = normalizeStatus(status);
  const translatedLabel = normalizedStatus ? t(`status.${normalizedStatus}`) : "-";
  const label = translatedLabel.startsWith("status.") ? normalizedStatus : translatedLabel;
  const baseClassName = "inline-flex w-fit items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap border";

  if (["ACTIVE", "COMPLETED", "SUCCESS", "PAID", "IMPORT", "RESTORE"].includes(normalizedStatus)) {
    return <div className={`${baseClassName} bg-emerald-50 text-emerald-700 border-emerald-200`}>{label}</div>;
  }

  if (["DRAFT", "PENDING", "ADJUSTMENT", "RESTORE"].includes(normalizedStatus)) {
    return <div className={`${baseClassName} bg-amber-50 text-amber-700 border-amber-200`}>{label}</div>;
  }

  if (["INACTIVE", "LOCKED", "CANCELLED", "FAILED", "REFUNDED", "EXPIRED", "SALE"].includes(normalizedStatus)) {
    return <div className={`${baseClassName} bg-rose-50 text-rose-700 border-rose-200`}>{label}</div>;
  }

  return <div className={`${baseClassName} bg-slate-50 text-slate-600 border-slate-200`}>{label}</div>;
}
