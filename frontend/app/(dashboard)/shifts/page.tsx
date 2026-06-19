"use client";

import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { shiftService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Shift } from "@/types/domain";

const PAGE_SIZE = 10;

export default function ShiftsPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Shift[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await shiftService.list({ page: currentPage, limit: PAGE_SIZE, status });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, status]);

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("shifts.title")} description={t("shifts.description")} />
        <ErrorState message={errorMessage} />
        <Card>
          <CardContent className="flex flex-wrap gap-3 pt-6">
            <Select className="max-w-[220px]" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">{t("common.allStatus")}</option>
              <option value="OPEN">{t("status.OPEN")}</option>
              <option value="CLOSED">{t("status.CLOSED")}</option>
            </Select>
            <Button type="button" onClick={() => loadData(1)}>{t("common.filter")}</Button>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable>
            <thead>
              <tr>
                <Th>{t("shifts.cashier")}</Th>
                <Th>{t("shifts.openingCash")}</Th>
                <Th>{t("shifts.closingCash")}</Th>
                <Th>{t("shifts.expectedCash")}</Th>
                <Th>{t("shifts.discrepancy")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("shifts.openedAt")}</Th>
                <Th>{t("shifts.closedAt")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td>{item.user?.fullName || item.userId}</Td>
                  <Td>{formatCurrency(item.openingCash)}</Td>
                  <Td>{item.closingCash === null ? "-" : formatCurrency(item.closingCash)}</Td>
                  <Td>{item.expectedCash === null ? "-" : formatCurrency(item.expectedCash)}</Td>
                  <Td className={item.discrepancyAmount ? "font-semibold text-destructive" : ""}>{item.discrepancyAmount === null ? "-" : formatCurrency(item.discrepancyAmount)}</Td>
                  <Td><StatusBadge status={item.status} /></Td>
                  <Td>{formatDateTime(item.openedAt)}</Td>
                  <Td>{formatDateTime(item.closedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}
