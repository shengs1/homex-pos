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
    <div className="flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        {t("pagination.info", {
          page: pagination.page,
          totalPages: Math.max(pagination.totalPages, 1),
          totalItems: pagination.totalItems,
        })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          {t("common.previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
