"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, RotateCcw, Search } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { useLanguage } from "@/contexts/language-context";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { paymentService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Payment, PaymentMethod, PaymentStatus } from "@/types/domain";

const PAGE_SIZE = 10;
const FETCH_PAGE_SIZE = 100;

const paymentMethods: PaymentMethod[] = ["CASH", "TRANSFER", "CARD", "WALLET"];
const paymentStatuses: PaymentStatus[] = ["PAID", "PENDING", "REFUNDED", "FAILED"];


function isMissingTranslation(value: string, keyPrefix: string) {
  return !value || value === keyPrefix || value.startsWith(`${keyPrefix}.`);
}

type PaymentFilters = {
  search: string;
  method: string;
  status: string;
  fromDate: string;
  toDate: string;
};

function getTimestamp(value: string | Date | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTimeParts(value: string | Date | null | undefined) {
  if (!value) {
    return { time: "-", date: "-" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { time: "-", date: "-" };
  }

  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
  };
}

function getPaymentDate(payment: Payment) {
  return payment.paidAt || payment.createdAt;
}

function sortPaymentsByPaidAtDesc(items: Payment[]) {
  return [...items].sort((a, b) => {
    const timeDiff = getTimestamp(getPaymentDate(b)) - getTimestamp(getPaymentDate(a));
    if (timeDiff !== 0) return timeDiff;
    return b.id - a.id;
  });
}



function getPaymentTransactionCode(payment: Payment) {
  const extendedPayment = payment as Payment & {
    paymentCode?: string | null;
    transactionCode?: string | null;
    code?: string | null;
  };

  return extendedPayment.paymentCode || extendedPayment.transactionCode || extendedPayment.code || `GD${String(payment.id).padStart(8, "0")}`;
}

function getLinkedOrderCode(payment: Payment) {
  return payment.order?.orderCode || `#${payment.orderId}`;
}

async function fetchAllPayments(filters: PaymentFilters) {
  const baseParams = {
    search: filters.search,
    method: filters.method,
    status: filters.status,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    sortBy: "paidAt",
    sortOrder: "desc",
    orderBy: "paidAt",
    order: "desc",
  };

  const firstPage = await paymentService.list({ ...baseParams, page: 1, limit: FETCH_PAGE_SIZE });
  const totalPages = Math.max(1, firstPage.pagination?.totalPages || 1);

  if (totalPages === 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => {
      return paymentService.list({ ...baseParams, page: index + 2, limit: FETCH_PAGE_SIZE });
    })
  );

  return firstPage.items.concat(remainingPages.flatMap((pageData) => pageData.items));
}

export default function PaymentsPage() {
  const { t, language } = useLanguage();
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
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function getPaymentMethodLabel(methodValue: string) {
    const translated = t(`paymentMethod.${methodValue}`);

    if (!isMissingTranslation(translated, "paymentMethod")) {
      return translated;
    }

    const fallbackLabels: Record<string, string> = {
      CASH: language === "en" ? "Cash" : "Tiền mặt",
      TRANSFER: language === "en" ? "Bank Transfer" : "Chuyển khoản ngân hàng",
      BANK_TRANSFER: language === "en" ? "Bank Transfer" : "Chuyển khoản ngân hàng",
      CARD: language === "en" ? "Card Swipe" : "Quẹt thẻ",
      WALLET: language === "en" ? "E-Wallet" : "Ví điện tử",
    };

    return fallbackLabels[methodValue] || methodValue;
  }

  function getPaymentStatusLabel(statusValue: string) {
    const translated = t(`status.${statusValue}`);

    if (!isMissingTranslation(translated, "status")) {
      return translated;
    }

    const fallbackLabels: Record<string, string> = {
      PAID: language === "en" ? "Paid" : "Đã thanh toán",
      PENDING: language === "en" ? "Pending" : "Chờ xử lý",
      REFUNDED: language === "en" ? "Refunded" : "Hoàn tiền",
      FAILED: language === "en" ? "Failed" : "Thất bại",
    };

    return fallbackLabels[statusValue] || statusValue;
  }

  function scrollToDetail() {
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const allPayments = await fetchAllPayments({ search, method, status, fromDate, toDate });
      const sortedPayments = sortPaymentsByPaidAtDesc(allPayments);
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const pageItems = sortedPayments.slice(startIndex, startIndex + PAGE_SIZE);
      const totalItems = sortedPayments.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

      setItems(pageItems);
      setPagination({
        page: currentPage,
        limit: PAGE_SIZE,
        totalItems,
        totalPages,
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(id: number) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      const detail = await paymentService.detail(id);
      setSelectedPayment(detail);
      scrollToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleRefund(payment: Payment) {
    const confirmed = window.confirm(t("payments.refundConfirm", { code: getPaymentTransactionCode(payment) }));
    if (!confirmed) return;

    try {
      setErrorMessage("");
      setSuccessMessage("");
      await paymentService.refund(payment.id);
      setSuccessMessage(t("payments.refundSuccess", { code: getPaymentTransactionCode(payment) }));
      await loadData(page);
      await loadDetail(payment.id);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, method, status]);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="w-full min-w-0 space-y-6 overflow-hidden">
        <PageHeader
          title={t("payments.title")}
          description={t("payments.description")}
        />

        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}

        <Card className="w-full min-w-0">
          <CardContent className="pt-6">
            <form onSubmit={handleFilter} className="flex w-full flex-wrap items-end gap-4">
              <div className="w-full min-w-[260px] flex-1">
                <Label className="mb-2 block">{t("common.search")}</Label>
                <Input
                  placeholder={t("payments.searchPlaceholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="w-full min-w-[190px] md:w-auto">
                <Label className="mb-2 block">{t("payments.method")}</Label>
                <Select
                  value={method}
                  onChange={(event) => {
                    setMethod(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t("common.allMethods")}</option>
                  {paymentMethods.map((paymentMethod) => (
                    <option key={paymentMethod} value={paymentMethod}>{getPaymentMethodLabel(paymentMethod)}</option>
                  ))}
                </Select>
              </div>

              <div className="w-full min-w-[170px] md:w-auto">
                <Label className="mb-2 block">{t("common.status")}</Label>
                <Select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t("common.allStatus")}</option>
                  {paymentStatuses.map((paymentStatus) => (
                    <option key={paymentStatus} value={paymentStatus}>{getPaymentStatusLabel(paymentStatus)}</option>
                  ))}
                </Select>
              </div>

              <DateFilterInput label={t("reports.fromDate")} value={fromDate} onChange={setFromDate} className="w-full min-w-[180px] md:w-[190px]" />
              <DateFilterInput label={t("reports.toDate")} value={toDate} onChange={setToDate} className="w-full min-w-[180px] md:w-[190px]" />

              <Button type="submit" className="w-full md:w-auto">
                <Search className="h-4 w-4" />
                {t("common.filter")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}

        {!isLoading && items.length > 0 ? (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataTable noHorizontalScroll className="rounded-none border-0 shadow-none">
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[15%]" />
                  <col className="w-[17%]" />
                  <col className="w-[14%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead>
                  <tr>
                    <Th className="w-[70px] whitespace-nowrap">{t("common.no")}</Th>
                    <Th>{t("payments.transactionId")}</Th>
                    <Th>{t("payments.linkedOrderCode")}</Th>
                    <Th>{t("payments.method")}</Th>
                    <Th>{t("payments.amountPaid")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th>{t("payments.paidAt")}</Th>
                    <Th className="w-[160px] whitespace-nowrap text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((payment, index) => {
                    const dateTime = formatDateTimeParts(getPaymentDate(payment));
                    const rowIndex = (page - 1) * PAGE_SIZE + index + 1;

                    return (
                      <tr key={payment.id}>
                        <Td>{rowIndex}</Td>
                        <Td>
                          <div className="truncate font-medium" title={getPaymentTransactionCode(payment)}>
                            {getPaymentTransactionCode(payment)}
                          </div>
                        </Td>
                        <Td>
                          <div className="truncate font-medium" title={getLinkedOrderCode(payment)}>
                            {getLinkedOrderCode(payment)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground" title={payment.order?.customer?.fullName || "-"}>
                            {payment.order?.customer?.fullName || "-"}
                          </div>
                        </Td>
                        <Td>{getPaymentMethodLabel(payment.method)}</Td>
                        <Td className="font-medium">{formatCurrency(payment.amount)}</Td>
                        <Td><StatusBadge status={payment.status} /></Td>
                        <Td>
                          <div className="leading-tight">
                            <div>{dateTime.time}</div>
                            <div>{dateTime.date}</div>
                          </div>
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => loadDetail(payment.id)}>
                              <Eye className="h-4 w-4" />
                              {t("payments.viewVoucher")}
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => handleRefund(payment)} disabled={payment.status === "REFUNDED"}>
                              <RotateCcw className="h-4 w-4" />
                              {t("payments.refundTransaction")}
                            </Button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        ) : null}

        <PaginationControls pagination={pagination} onPageChange={setPage} />

        <div ref={detailRef}>
          {selectedPayment ? (
            <Card className="w-full min-w-0">
              <CardHeader className="border-b">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <CardTitle>{t("payments.voucherTitle", { code: getPaymentTransactionCode(selectedPayment) })}</CardTitle>
                  <Button type="button" variant="destructive" onClick={() => handleRefund(selectedPayment)} disabled={selectedPayment.status === "REFUNDED"}>
                    <RotateCcw className="h-4 w-4" />
                    {t("payments.refundTransaction")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="text-sm font-semibold">{t("payments.transactionId")}</p>
                  <p className="break-words">{getPaymentTransactionCode(selectedPayment)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.linkedOrderCode")}</p>
                  <p className="break-words">{getLinkedOrderCode(selectedPayment)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.reconcileCode")}</p>
                  <p className="break-words">DS-{getPaymentTransactionCode(selectedPayment)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.method")}</p>
                  <p>{getPaymentMethodLabel(selectedPayment.method)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.amountPaid")}</p>
                  <p>{formatCurrency(selectedPayment.amount)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.cashflowStatus")}</p>
                  <StatusBadge status={selectedPayment.status} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.paidAt")}</p>
                  <p>{formatDateTimeParts(getPaymentDate(selectedPayment)).time} {formatDateTimeParts(getPaymentDate(selectedPayment)).date}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("orders.customer")}</p>
                  <p className="break-words">{selectedPayment.order?.customer?.fullName || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("payments.internalOrderId")}</p>
                  <p>#{selectedPayment.orderId}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </RoleGuard>
  );
}
