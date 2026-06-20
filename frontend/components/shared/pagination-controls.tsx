"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import type { Pagination } from "@/types/api";

type PaginationControlsProps = {
  pagination: Pagination | null;
  onPageChange: (page: number) => void;
};

export function PaginationControls({ pagination, onPageChange }: PaginationControlsProps) {
  const { t } = useLanguage();

  if (!pagination) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3 pt-4 text-xs font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
      <span className="min-w-0 truncate">
        {t("pagination.info", {
          page: pagination.page,
          totalPages: Math.max(pagination.totalPages, 1),
          totalItems: pagination.totalItems,
        })}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-8 rounded-lg px-3"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          {t("common.previous")}
        </Button>
        <div className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground">
          {pagination.page}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-8 rounded-lg px-3"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
