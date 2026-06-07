"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, RotateCcw, Search } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { ActionMenu } from "@/components/shared/action-menu";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { paymentService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Payment, PaymentMethod } from "@/types/domain";

const paymentMethods: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "WALLET"];

export default function PaymentsPage() {
  const { t } = useLanguage();
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Payment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [orderId, setOrderId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function scrollToDetail() {
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await paymentService.list({ page: currentPage, limit: 10, search, method, status, fromDate, toDate });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(id: number) {
    try {
      setErrorMessage("");
      const data = await paymentService.detail(id);
      setSelectedPayment(data);
      scrollToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function findByOrderId() {
    if (!orderId.trim()) return;

    try {
      setErrorMessage("");
      const data = await paymentService.byOrder(Number(orderId));
      setSelectedPayment(data);
      scrollToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleRefund(item: Payment) {
    if (!window.confirm(t("payments.refundConfirm", { id: item.id }))) return;

    try {
      setErrorMessage("");
      await paymentService.refund(item.id);
      await loadData(page);
      await loadDetail(item.id);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, method, status]);

  function handleFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="w-full min-w-0 space-y-6 overflow-hidden">
        <PageHeader title={t("payments.title")} description={t("payments.description")} />
        <ErrorState message={errorMessage} />

        {/* Unified toolbar: filters and search by order id stay in one full-width block. */}
        <Card className="w-full min-w-0">
          <CardContent className="pt-6">
            <form onSubmit={handleFilter} className="flex w-full flex-wrap items-end gap-4">
              <div className="w-full min-w-[220px] flex-1">
                <Label className="mb-2 block">{t("common.search")}</Label>
                <Input placeholder={t("payments.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div className="w-full min-w-[180px] md:w-auto">
                <Label className="mb-2 block">{t("payments.method")}</Label>
                <Select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }}>
                  <option value="">{t("common.allMethods")}</option>
                  {paymentMethods.map((item) => <option key={item} value={item}>{t(`paymentMethod.${item}`)}</option>)}
                </Select>
              </div>
              <div className="w-full min-w-[180px] md:w-auto">
                <Label className="mb-2 block">{t("common.status")}</Label>
                <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                  <option value="">{t("common.allStatus")}</option>
                  <option value="PAID">{t("status.PAID")}</option>
                  <option value="PENDING">{t("status.PENDING")}</option>
                  <option value="FAILED">{t("status.FAILED")}</option>
                  <option value="REFUNDED">{t("status.REFUNDED")}</option>
                </Select>
              </div>
              <div className="w-full min-w-[180px] md:w-auto">
                <Label className="mb-2 block">{t("reports.fromDate")}</Label>
                <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="w-full min-w-[180px] md:w-auto">
                <Label className="mb-2 block">{t("reports.toDate")}</Label>
                <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
              <div className="w-full min-w-[220px] md:w-[240px]">
                <Label className="mb-2 block">{t("payments.findByOrder")}</Label>
                <Input type="number" placeholder={t("payments.orderIdPlaceholder")} value={orderId} onChange={(event) => setOrderId(event.target.value)} />
              </div>
              <Button type="submit" className="w-full md:w-auto">{t("common.filter")}</Button>
              <Button type="button" variant="outline" className="w-full md:w-auto" onClick={findByOrderId}>
                <Search className="h-4 w-4" />
                {t("common.search")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable noHorizontalScroll>
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[23%]" />
              <col className="w-[14%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[17%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <Th>{t("payments.id")}</Th>
                <Th>{t("payments.order")}</Th>
                <Th>{t("payments.method")}</Th>
                <Th>{t("payments.amount")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("payments.paidAt")}</Th>
                <Th className="text-right">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td className="font-medium">#{item.id}</Td>
                  <Td>
                    <div className="truncate font-medium" title={item.order?.orderCode || String(item.orderId)}>{item.order?.orderCode || item.orderId}</div>
                    <div className="truncate text-xs text-muted-foreground" title={item.order?.customer?.fullName || "-"}>{item.order?.customer?.fullName || "-"}</div>
                  </Td>
                  <Td><div className="truncate">{t(`paymentMethod.${item.method}`)}</div></Td>
                  <Td>{formatCurrency(item.amount)}</Td>
                  <Td><StatusBadge status={item.status} /></Td>
                  <Td><div className="truncate">{formatDateTime(item.paidAt || item.createdAt)}</div></Td>
                  <Td className="text-right">
                    <ActionMenu
                      label={t("common.actions")}
                      items={[
                        { label: t("common.detail"), icon: <Eye className="h-4 w-4" />, onClick: () => loadDetail(item.id) },
                        { label: t("payments.refund"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRefund(item), variant: "destructive", disabled: item.status === "REFUNDED" },
                      ]}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />

        <div ref={detailRef}>
          {selectedPayment ? (
            <Card className="w-full min-w-0">
              <CardHeader><CardTitle>{t("payments.detailTitle", { id: selectedPayment.id })}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div><p className="text-sm font-semibold">{t("payments.order")}</p><p className="break-words">{selectedPayment.order?.orderCode || selectedPayment.orderId}</p></div>
                <div><p className="text-sm font-semibold">{t("payments.method")}</p><p>{t(`paymentMethod.${selectedPayment.method}`)}</p></div>
                <div><p className="text-sm font-semibold">{t("payments.amount")}</p><p>{formatCurrency(selectedPayment.amount)}</p></div>
                <div><p className="text-sm font-semibold">{t("common.status")}</p><StatusBadge status={selectedPayment.status} /></div>
                <div><p className="text-sm font-semibold">{t("payments.paidAt")}</p><p>{formatDateTime(selectedPayment.paidAt || selectedPayment.createdAt)}</p></div>
                <div><p className="text-sm font-semibold">{t("orders.customer")}</p><p className="break-words">{selectedPayment.order?.customer?.fullName || "-"}</p></div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </RoleGuard>
  );
}
