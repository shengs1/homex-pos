"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { vatInvoiceService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { VatInvoiceRequest } from "@/types/domain";

const PAGE_SIZE = 10;

export default function VatInvoicesPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<VatInvoiceRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [redInvoiceCodes, setRedInvoiceCodes] = useState<Record<number, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await vatInvoiceService.list({ page: currentPage, limit: PAGE_SIZE, search, status });
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

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  async function approve(item: VatInvoiceRequest) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await vatInvoiceService.approve(item.id, {
        redInvoiceCode: redInvoiceCodes[item.id] || "",
        adminNote: adminNotes[item.id] || "",
      });
      setSuccessMessage(t("vat.approved"));
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function reject(item: VatInvoiceRequest) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await vatInvoiceService.reject(item.id, { adminNote: adminNotes[item.id] || "" });
      setSuccessMessage(t("vat.rejected"));
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("vat.title")} description={t("vat.description")} />
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{successMessage}</div> : null}

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              <Input placeholder={t("vat.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">{t("common.allStatus")}</option>
                <option value="PENDING">{t("status.PENDING")}</option>
                <option value="APPROVED">{t("status.APPROVED")}</option>
                <option value="REJECTED">{t("status.REJECTED")}</option>
              </Select>
              <Button type="submit">{t("common.search")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable>
            <thead>
              <tr>
                <Th>{t("orders.orderCode")}</Th>
                <Th>{t("vat.companyName")}</Th>
                <Th>{t("vat.taxCode")}</Th>
                <Th>{t("orders.total")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("common.createdAt")}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td>{item.order?.orderCode || item.orderId}</Td>
                  <Td>
                    <div className="font-medium">{item.companyName}</div>
                    <div className="text-xs text-muted-foreground">{item.companyAddress}</div>
                  </Td>
                  <Td>{item.taxCode}</Td>
                  <Td>{item.order ? formatCurrency(item.order.totalAmount) : "-"}</Td>
                  <Td><StatusBadge status={item.status} /></Td>
                  <Td>{formatDateTime(item.requestedAt)}</Td>
                  <Td>
                    {item.status === "PENDING" ? (
                      <div className="grid min-w-[260px] gap-2">
                        <Input placeholder={t("vat.redInvoiceCode")} value={redInvoiceCodes[item.id] || ""} onChange={(event) => setRedInvoiceCodes((current) => ({ ...current, [item.id]: event.target.value }))} />
                        <Input placeholder={t("vat.adminNote")} value={adminNotes[item.id] || ""} onChange={(event) => setAdminNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={() => approve(item)}><CheckCircle className="h-4 w-4" />{t("vat.approve")}</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => reject(item)}><XCircle className="h-4 w-4" />{t("vat.reject")}</Button>
                        </div>
                      </div>
                    ) : (
                      item.redInvoiceCode || item.adminNote || "-"
                    )}
                  </Td>
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
