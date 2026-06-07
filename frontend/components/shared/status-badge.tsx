"use client";

import { Badge } from "@/components/ui/badge";
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

  if (["INACTIVE", "LOCKED", "CANCELLED", "FAILED", "REFUNDED", "EXPIRED"].includes(normalizedStatus)) {
    return <Badge variant="destructive" className="max-w-full justify-center whitespace-normal text-center leading-tight">{label}</Badge>;
  }

  if (["DRAFT", "PENDING", "ADJUSTMENT", "RESTORE"].includes(normalizedStatus)) {
    return <Badge variant="secondary" className="max-w-full justify-center whitespace-normal text-center leading-tight">{label}</Badge>;
  }

  return <Badge className="max-w-full justify-center whitespace-normal text-center leading-tight">{label}</Badge>;
}
