"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Inbox, XCircle } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { ErrorState, LoadingState } from "@/components/shared/message-state";
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
  const router = useRouter();
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
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
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

        {!isLoading && items.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-lg font-bold">Chưa có yêu cầu xuất VAT</h3>
            <p className="max-w-md text-sm text-muted-foreground mb-6">
              Chọn hóa đơn bán lẻ → Điền thông tin công ty (MST, Tên doanh nghiệp, Email) → Bấm Tạo yêu cầu xuất VAT
            </p>
            <Button type="button" onClick={() => router.push("/orders")}>
              Xem hóa đơn bán lẻ
            </Button>
          </div>
        ) : null}

        {!isLoading && items.length > 0 ? (
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <DataTable className="rounded-none border-0 shadow-none min-w-[1000px]">
                <thead>
                  <tr>
                    <Th>Mã yêu cầu</Th>
                    <Th>{t("orders.orderCode")}</Th>
                    <Th>{t("vat.companyName")}</Th>
                    <Th>{t("vat.taxCode")}</Th>
                    <Th>Email</Th>
                    <Th>{t("orders.total")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th>{t("common.createdAt")}</Th>
                    <Th className="text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <Td className="font-semibold text-muted-foreground">#{item.id}</Td>
                      <Td className="font-medium">{item.order?.orderCode || item.orderId}</Td>
                      <Td>
                        <div className="font-medium">{item.companyName}</div>
                        <div className="text-xs text-muted-foreground">{item.companyAddress}</div>
                      </Td>
                      <Td>{item.taxCode}</Td>
                      <Td>{item.buyerEmail || "-"}</Td>
                      <Td className="font-medium">{item.order ? formatCurrency(item.order.totalAmount) : "-"}</Td>
                      <Td><StatusBadge status={item.status} /></Td>
                      <Td>{formatDateTime(item.requestedAt)}</Td>
                      <Td className="text-right">
                        {item.status === "PENDING" ? (
                          <div className="flex min-w-[260px] flex-col items-end gap-2">
                            <Input className="h-8 text-xs" placeholder={t("vat.redInvoiceCode")} value={redInvoiceCodes[item.id] || ""} onChange={(event) => setRedInvoiceCodes((current) => ({ ...current, [item.id]: event.target.value }))} />
                            <Input className="h-8 text-xs" placeholder={t("vat.adminNote")} value={adminNotes[item.id] || ""} onChange={(event) => setAdminNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                            <div className="flex w-full gap-2">
                              <Button type="button" size="sm" className="flex-1" onClick={() => approve(item)}><CheckCircle className="h-3 w-3 mr-1" />{t("vat.approve")}</Button>
                              <Button type="button" size="sm" className="flex-1" variant="outline" onClick={() => reject(item)}><XCircle className="h-3 w-3 mr-1" />{t("vat.reject")}</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm">
                            {item.redInvoiceCode ? <div className="font-semibold text-emerald-600">{item.redInvoiceCode}</div> : null}
                            {item.adminNote ? <div className="text-xs text-muted-foreground">{item.adminNote}</div> : null}
                            {!item.redInvoiceCode && !item.adminNote ? "-" : null}
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}
