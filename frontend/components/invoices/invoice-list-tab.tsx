"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, PlayCircle, Plus, Printer, XCircle, RotateCcw, FileClock } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/contexts/language-context";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { PrintableInvoice } from "@/components/shared/printable-invoice";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { StatusBadge } from "@/components/shared/status-badge";
import { useToast } from "@/contexts/toast-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { formatDateVN } from "@/lib/date-format";
import { orderService, settingService, userService, returnOrderService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Order, Setting, UserAccount } from "@/types/domain";

const PAGE_SIZE = 10;
const FETCH_PAGE_SIZE = 100;
const POS_RESUME_DRAFT_ORDER_ID_KEY = "homex_pos_resume_draft_order_id";

type OrderFilters = {
  search: string;
  status: string;
  cashierId: string;
  paymentMethod: string;
  startDate: string;
  endDate: string;
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
    return {
      time: "-",
      date: "-",
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      time: "-",
      date: "-",
    };
  }

  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
  };
}

function sortOrdersByCreatedAtDesc(items: Order[]) {
  return [...items].sort((a, b) => {
    const timeDiff = getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return b.id - a.id;
  });
}

async function fetchAllOrders(filters: OrderFilters) {
  const baseParams = {
    search: filters.search,
    status: filters.status,
    sortBy: "createdAt",
    sortOrder: "desc",
    orderBy: "createdAt",
    order: "desc",
  };

  const firstPage = await orderService.list({ ...baseParams, page: 1, limit: FETCH_PAGE_SIZE });
  const totalPages = Math.max(1, firstPage.pagination?.totalPages || 1);

  let allItems = firstPage.items;
  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) => {
        return orderService.list({ ...baseParams, page: index + 2, limit: FETCH_PAGE_SIZE });
      })
    );
    allItems = allItems.concat(remainingPages.flatMap((pageData) => pageData.items));
  }

  return allItems.filter(order => {
    if (filters.cashierId && String(order.userId) !== filters.cashierId) return false;
    if (filters.paymentMethod && order.payment?.method !== filters.paymentMethod) return false;
    
    const orderTime = getTimestamp(order.createdAt);
    if (filters.startDate) {
      const start = getTimestamp(filters.startDate);
      if (orderTime < start) return false;
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      if (orderTime > end.getTime()) return false;
    }
    
    return true;
  });
}

function getOrderCustomerName(order: Order, fallback: string) {
  return order.customer?.fullName || fallback;
}

function getOrderCashierName(order: Order) {
  return order.user?.fullName || `#${order.userId}`;
}

export function InvoiceListTab({ forceStatus }: { forceStatus?: string }) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const user = useCurrentUser();
  const detailRef = useRef<HTMLDivElement | null>(null);
  
  const [items, setItems] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(forceStatus || "");
  const [cashierId, setCashierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isCreatingReturn, setIsCreatingReturn] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState("");

  const [isCreatingVat, setIsCreatingVat] = useState(false);
  const [vatForm, setVatForm] = useState({ companyName: "", taxCode: "", buyerEmail: "", companyAddress: "", note: "" });

  const selectedOrderPayment = selectedOrder?.payment || null;
  const selectedOrderWarranties = useMemo(() => {
    return selectedOrder?.orderDetails.flatMap((detail) => (detail.warranty ? [{ warranty: detail.warranty, detail }] : [])) || [];
  }, [selectedOrder]);

  function scrollToDetail() {
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);

      const allOrders = await fetchAllOrders({ search, status, cashierId, paymentMethod, startDate, endDate });
      const sortedOrders = sortOrdersByCreatedAtDesc(allOrders);
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const pageItems = sortedOrders.slice(startIndex, startIndex + PAGE_SIZE);
      const totalItems = sortedOrders.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

      setItems(pageItems);
      setPagination({
        page: currentPage,
        limit: PAGE_SIZE,
        totalItems,
        totalPages,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSetting() {
    try {
      const data = await settingService.get();
      setSetting(data);
    } catch {
      setSetting(null);
    }
  }

  async function loadUsers() {
    try {
      const data = await userService.list({ limit: 100 });
      setUsers(data.items);
    } catch {
      // ignore
    }
  }

  async function loadDetail(id: number) {
    try {
      const detail = await orderService.detail(id);
      setSelectedOrder(detail);
      setIsCreatingReturn(false);
      setReturnQuantities({});
      setReturnReason("");
      setIsCreatingVat(false);
      setVatForm({ companyName: "", taxCode: "", buyerEmail: "", companyAddress: "", note: "" });
      scrollToDetail();
      return detail;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return null;
    }
  }

  async function handlePrintInvoice(order: Order) {
    const detail = await loadDetail(order.id);
    if (!detail) return;

    window.setTimeout(() => {
      window.print();
    }, 250);
  }

  async function handleCancelOrder(order: Order) {
    const confirmed = window.confirm(t("orders.cancelConfirm", { code: order.orderCode }));
    if (!confirmed) return;

    try {
      await orderService.cancel(order.id);
      toast.success(t("orders.cancelSuccess", { code: order.orderCode }));
      await loadData(page);

      if (selectedOrder?.id === order.id) {
        await loadDetail(order.id);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleContinuePayment(order: Order) {
    try {
      const detail = await orderService.detail(order.id);

      if (detail.status !== "DRAFT") {
        toast.error(t("orders.onlyDraftCanContinue"));
        return;
      }

      window.localStorage.setItem(POS_RESUME_DRAFT_ORDER_ID_KEY, String(detail.id));
      router.push("/pos");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function submitReturnOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    const returnItems = Object.entries(returnQuantities)
      .map(([id, qty]) => ({ orderDetailId: Number(id), quantity: Number(qty || 0) }))
      .filter((item) => item.quantity > 0);

    if (returnItems.length === 0) {
      toast.error(t("returnOrders.requireItems"));
      return;
    }

    try {
      await returnOrderService.create({
        orderId: selectedOrder.id,
        reason: returnReason,
        items: returnItems,
      });
      toast.success(t("returnOrders.created"));
      setIsCreatingReturn(false);
      await loadData(page);
      await loadDetail(selectedOrder.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function submitVatRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    if (!vatForm.companyName.trim()) {
      toast.error(t("vat.companyName") + " is required.");
      return;
    }
    if (!vatForm.taxCode.trim()) {
      toast.error(t("vat.taxCode") + " is required.");
      return;
    }
    if (vatForm.buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vatForm.buyerEmail)) {
      toast.error(t("vat.email") + " is invalid.");
      return;
    }

    try {
      // Using API directly
      await fetch(`/api/vat-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedOrder.id, ...vatForm })
      }).then(res => {
        if (!res.ok) throw new Error("Failed to create VAT request");
        return res.json();
      });

      toast.success(t("vat.requestSent"));
      setIsCreatingVat(false);
      await loadData(page);
      await loadDetail(selectedOrder.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, status, cashierId, paymentMethod, startDate, endDate]);

  useEffect(() => {
    loadSetting();
    loadUsers();
  }, []);

  async function exportOrdersCsv() {
    const allOrders = sortOrdersByCreatedAtDesc(await fetchAllOrders({ search, status, cashierId, paymentMethod, startDate, endDate }));
    const rows = [
      ["orderCode", "customer", "cashier", "totalAmount", "status", "paymentMethod", "createdAt"],
      ...allOrders.map((order) => [
        order.orderCode,
        getOrderCustomerName(order, t("customers.retail")),
        getOrderCashierName(order),
        String(order.totalAmount),
        order.status,
        order.payment ? t(`paymentMethod.${order.payment.method}`) : "-",
        formatDateTimeParts(order.createdAt).date,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="min-w-0 space-y-5 print:hidden no-print">

        <Card className="min-w-0">
          <CardContent className="p-4">
            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 w-full">
              {/* Row 1 */}
              <div className="flex flex-wrap items-center gap-3 w-full">
                <Input
                  placeholder={t("invoices.searchPlaceholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 flex-1 min-w-[200px] text-sm border-slate-200 rounded-lg px-3 focus:ring-1 focus:ring-teal-500"
                />

                {!forceStatus && (
                  <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 w-[155px] text-sm border-slate-200 rounded-lg px-2 text-slate-600 bg-white">
                    <option value="">{t("invoices.allStatuses")}</option>
                    <option value="DRAFT">{t("status.DRAFT")}</option>
                    <option value="COMPLETED">{t("status.COMPLETED")}</option>
                    <option value="CANCELLED">{t("status.CANCELLED")}</option>
                  </Select>
                )}

                <Select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setPage(1); }} className="h-10 w-[210px] text-sm border-slate-200 rounded-lg px-2 text-slate-600 bg-white">
                  <option value="">{t("invoices.allPaymentMethods")}</option>
                  <option value="CASH">{t("paymentMethod.CASH")}</option>
                  <option value="TRANSFER">{t("paymentMethod.TRANSFER")}</option>
                </Select>

                <Select value={cashierId} onChange={(event) => { setCashierId(event.target.value); setPage(1); }} className="h-10 w-[155px] text-sm border-slate-200 rounded-lg px-2 text-slate-600 bg-white">
                  <option value="">{t("invoices.allCashiers")}</option>
                  {users.map(u => (
                    <option key={u.id} value={String(u.id)}>{u.fullName}</option>
                  ))}
                </Select>
              </div>

              {/* Row 2 */}
              <div className="flex flex-wrap items-center gap-3 w-full justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <DateFilterInput value={startDate} onChange={(val) => { setStartDate(val); setPage(1); }} label="" prefixLabel={t("invoices.fromDateShort")} className="w-[210px] space-y-0" inputClassName="h-10 border-slate-200 rounded-lg bg-white" placeholder="dd/mm/yyyy" />
                  <DateFilterInput value={endDate} onChange={(val) => { setEndDate(val); setPage(1); }} label="" prefixLabel={t("invoices.toDateShort")} className="w-[210px] space-y-0" inputClassName="h-10 border-slate-200 rounded-lg bg-white" placeholder="dd/mm/yyyy" />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <Button type="submit" className="h-10 bg-teal-600 hover:bg-teal-700 text-white px-5 rounded-lg text-sm font-medium transition-colors shrink-0">
                    {t("invoices.search")}
                  </Button>
                  <Button type="button" variant="outline" onClick={exportOrdersCsv} className="h-10 border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-white shrink-0">
                    <Download className="h-4 w-4" />
                    {t("invoices.exportCsv")}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState actionLabel={t("common.addNew")} onAction={() => router.push("/pos")} /> : null}

        {!isLoading && items.length > 0 ? (
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <DataTable className="rounded-none border-0 shadow-none min-w-[800px]">
                <thead>
                  <tr>
                    <Th>{t("orders.orderCode")}</Th>
                    <Th>{t("orders.customer")}</Th>
                    <Th>{t("orders.cashier")}</Th>
                    <Th>{t("orders.total")}</Th>
                    <Th>{t("payments.method")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th>{t("common.createdAt")}</Th>
                    <Th className="text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((order) => {
                    const dateTime = formatDateTimeParts(order.createdAt);

                    return (
                      <tr key={order.id}>
                        <Td>
                          <div className="break-words whitespace-normal line-clamp-2 font-medium" title={order.orderCode}>
                            {order.orderCode}
                          </div>
                        </Td>
                        <Td>
                          <div className="break-words whitespace-normal line-clamp-2" title={getOrderCustomerName(order, t("customers.retail"))}>
                            {getOrderCustomerName(order, t("customers.retail"))}
                          </div>
                        </Td>
                        <Td>
                          <div className="break-words whitespace-normal line-clamp-2" title={getOrderCashierName(order)}>
                            {getOrderCashierName(order)}
                          </div>
                        </Td>
                        <Td className="font-medium">{formatCurrency(order.totalAmount)}</Td>
                        <Td>
                          {order.payment ? (
                            t(`paymentMethod.${order.payment.method}`)
                          ) : (
                            <span className="text-orange-600 font-medium text-xs">{t("invoices.unpaid")}</span>
                          )}
                        </Td>
                        <Td><StatusBadge status={order.status} /></Td>
                        <Td>
                          <div className="leading-tight text-xs">
                            <div>{dateTime.time}</div>
                            <div>{dateTime.date}</div>
                          </div>
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => loadDetail(order.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {order.status === "DRAFT" ? (
                              <Button type="button" size="sm" onClick={() => handleContinuePayment(order)}>
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button type="button" size="sm" variant="outline" onClick={() => handlePrintInvoice(order)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                            {user?.role === "ADMIN" ? (
                              <Button type="button" size="sm" variant="destructive" onClick={() => handleCancelOrder(order)} disabled={order.status === "CANCELLED"}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            ) : null}
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

        <div ref={detailRef} className="print:block">
          {selectedOrder ? (
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-b from-card to-muted/20 shadow-sm print:border-0 print:shadow-none">
              <CardHeader className="border-b bg-card/80">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>{t("orders.detailTitle", { code: selectedOrder.orderCode })}</CardTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={selectedOrder.status} />
                      <span className="text-sm font-semibold text-primary">{formatCurrency(selectedOrder.totalAmount)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedOrder.status === "DRAFT" ? (
                      <Button type="button" onClick={() => handleContinuePayment(selectedOrder)}>
                        <PlayCircle className="h-4 w-4" />
                        {t("orders.continuePayment")}
                      </Button>
                    ) : null}
                    
                    {selectedOrder.status === "COMPLETED" && user?.role === "ADMIN" ? (
                      <Button type="button" variant="outline" onClick={() => { setIsCreatingReturn(!isCreatingReturn); setIsCreatingVat(false); }}>
                        <RotateCcw className="h-4 w-4" />
                        {t("returnOrders.create")}
                      </Button>
                    ) : null}

                    {selectedOrder.status === "COMPLETED" && !selectedOrder.vatInvoiceRequest ? (
                      <Button type="button" variant="outline" onClick={() => { setIsCreatingVat(!isCreatingVat); setIsCreatingReturn(false); }}>
                        <FileClock className="h-4 w-4" />
                        {t("invoices.createVatRequest")}
                      </Button>
                    ) : null}

                    <Button type="button" variant="outline" onClick={() => handlePrintInvoice(selectedOrder)}>
                      <Printer className="h-4 w-4" />
                      {t("orders.printInvoice")}
                    </Button>
                    
                    {user?.role === "ADMIN" ? (
                      <Button type="button" variant="destructive" onClick={() => handleCancelOrder(selectedOrder)} disabled={selectedOrder.status === "CANCELLED"}>
                        <XCircle className="h-4 w-4" />
                        {t("orders.cancelOrder")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {isCreatingReturn ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-6">
                    <h3 className="mb-4 font-bold text-lg">{t("returnOrders.createTitle")}</h3>
                    <form onSubmit={submitReturnOrder} className="space-y-4">
                      <div className="overflow-x-auto">
                        <DataTable>
                          <thead>
                            <tr>
                              <Th>{t("products.product")}</Th>
                              <Th>{t("reports.quantity")}</Th>
                              <Th>{t("orders.unitPrice")}</Th>
                              <Th>{t("returnOrders.returnQuantity")}</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedOrder.orderDetails.map((detail) => (
                              <tr key={detail.id}>
                                <Td>
                                  <div className="font-medium">{detail.product?.name || detail.productId}</div>
                                  <div className="text-xs text-muted-foreground">{detail.product?.sku}</div>
                                </Td>
                                <Td>{detail.quantity}</Td>
                                <Td>{formatCurrency(detail.unitPrice)}</Td>
                                <Td>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={detail.quantity}
                                    value={returnQuantities[detail.id] || 0}
                                    onChange={(event) => setReturnQuantities((current) => ({ ...current, [detail.id]: Number(event.target.value || 0) }))}
                                    className="w-24"
                                  />
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </DataTable>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("returnOrders.reason")}</Label>
                        <Textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit">{t("common.save")}</Button>
                        <Button type="button" variant="ghost" onClick={() => setIsCreatingReturn(false)}>{t("common.cancel")}</Button>
                      </div>
                    </form>
                  </div>
                ) : null}

                {isCreatingVat ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 mb-6">
                    <h3 className="mb-4 font-bold text-lg text-blue-900">{t("vat.requestVat")}</h3>
                    <form onSubmit={submitVatRequest} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t("vat.companyName")} <span className="text-red-500">*</span></Label>
                          <Input required value={vatForm.companyName} onChange={e => setVatForm({...vatForm, companyName: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("vat.taxCode")} <span className="text-red-500">*</span></Label>
                          <Input required value={vatForm.taxCode} onChange={e => setVatForm({...vatForm, taxCode: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("vat.email")}</Label>
                          <Input type="email" value={vatForm.buyerEmail} onChange={e => setVatForm({...vatForm, buyerEmail: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("vat.companyAddress")}</Label>
                          <Input value={vatForm.companyAddress} onChange={e => setVatForm({...vatForm, companyAddress: e.target.value})} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.note")}</Label>
                        <Textarea value={vatForm.note} onChange={e => setVatForm({...vatForm, note: e.target.value})} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit">{t("common.save")}</Button>
                        <Button type="button" variant="ghost" onClick={() => setIsCreatingVat(false)}>{t("common.cancel")}</Button>
                      </div>
                    </form>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-sm font-semibold">{t("invoices.createdAt")}</p>
                    <p>{formatDateTimeParts(selectedOrder.createdAt).time} {formatDateTimeParts(selectedOrder.createdAt).date}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t("orders.customer")}</p>
                    <p>
                      {getOrderCustomerName(selectedOrder, t("customers.retail"))}
                      {selectedOrder.customer?.phone ? ` - ${selectedOrder.customer.phone}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t("orders.cashier")}</p>
                    <p>{getOrderCashierName(selectedOrder)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t("common.status")}</p>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                  {selectedOrderPayment && selectedOrderPayment.amount < selectedOrder.totalAmount ? (
                    <div>
                      <p className="text-sm font-semibold">{language === "en" ? "Discount" : "Giảm giá"}</p>
                      <p className="text-emerald-600 font-bold">-{formatCurrency(Number(selectedOrder.totalAmount) - Number(selectedOrderPayment.amount))}</p>
                    </div>
                  ) : null}
                  {selectedOrderPayment ? (
                    <>
                      <div>
                        <p className="text-sm font-semibold">{t("invoices.paymentMethod")}</p>
                        <p>{t(`paymentMethod.${selectedOrderPayment.method}`)}</p>
                      </div>
                      {selectedOrderPayment.method === "CASH" ? (
                        <>
                          <div>
                            <p className="text-sm font-semibold">{t("payments.cashReceived")}</p>
                            <p>{formatCurrency(selectedOrderPayment.cashReceived || 0)}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{t("payments.changeAmount")}</p>
                            <p>{formatCurrency(selectedOrderPayment.changeAmount || 0)}</p>
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {selectedOrder.customer && selectedOrderPayment ? (
                    <div>
                      <p className="text-sm font-semibold">{t("customers.points")}</p>
                      <p className="text-blue-600 font-bold">+{Math.floor(Number(selectedOrderPayment.amount) / 100000)}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold">{t("orders.total")}</p>
                    <p className="font-bold text-primary text-lg">{formatCurrency(selectedOrder.totalAmount)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 font-semibold">{t("orders.items")}</h3>
                  <div className="overflow-x-auto">
                    <DataTable className="min-w-[500px]">
                      <colgroup>
                        <col className="w-[45%]" />
                        <col className="w-[15%]" />
                        <col className="w-[20%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                      <thead>
                        <tr>
                          <Th>{t("products.product")}</Th>
                          <Th>{t("reports.quantity")}</Th>
                          <Th>{t("orders.unitPrice")}</Th>
                          <Th>{t("orders.lineTotal")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.orderDetails.map((detail) => (
                          <tr key={detail.id}>
                            <Td>
                              <div className="break-words font-medium">{detail.product?.name || `${t("products.name")} #${detail.productId}`}</div>
                              <div className="break-words whitespace-normal line-clamp-2 text-xs text-muted-foreground">{detail.product?.sku || "-"}</div>
                            </Td>
                            <Td>{detail.quantity}</Td>
                            <Td>{formatCurrency(detail.unitPrice)}</Td>
                            <Td>{formatCurrency(detail.lineTotal)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>{t("invoices.paymentMethod")}</CardTitle></CardHeader>
                    <CardContent>
                      {selectedOrderPayment ? (
                        <div className="space-y-2 text-sm">
                          <p><span className="font-semibold">{t("payments.amountPaid")}:</span> {formatCurrency(selectedOrderPayment.amount)}</p>
                          <p><span className="font-semibold">{t("invoices.paymentMethod")}:</span> {t(`paymentMethod.${selectedOrderPayment.method}`)}</p>
                          {selectedOrderPayment.method === "CASH" ? (
                            <>
                              <p><span className="font-semibold">{t("payments.cashReceived")}:</span> {formatCurrency(selectedOrderPayment.cashReceived || 0)}</p>
                              <p><span className="font-semibold">{t("payments.changeAmount")}:</span> {formatCurrency(selectedOrderPayment.changeAmount || 0)}</p>
                            </>
                          ) : null}
                          <StatusBadge status={selectedOrderPayment.status} />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("invoices.unpaid")}</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle>{t("warranties.title")}</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm max-h-[300px] overflow-y-auto">
                      {selectedOrderWarranties.length > 0 ? (
                        selectedOrderWarranties.map(({ warranty, detail }) => {
                          return (
                            <div key={warranty.id} className="rounded-lg border p-3 space-y-1">
                              <div className="flex justify-between items-start">
                                <p className="font-semibold text-primary">{warranty.warrantyCode}</p>
                                <StatusBadge status={warranty.status} />
                              </div>
                              <p className="text-sm font-semibold text-slate-800">
                                {detail.product?.name || (warranty as any).productName || "Sản phẩm gia dụng"}
                              </p>
                              <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                                <div><span className="font-semibold">{t("promotions.startDate")}:</span> {formatDateVN(warranty.startDate)}</div>
                                <div><span className="font-semibold">{t("reports.toDate")}:</span> {formatDateVN(warranty.endDate)}</div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-muted-foreground">{t("orders.noWarranty")}</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      {selectedOrder ? (
        <PrintableInvoice
          order={selectedOrder}
          setting={setting}
          publicUrl={typeof window !== "undefined" ? `${window.location.origin}/invoice/${selectedOrder.orderCode}` : ""}
          className="hidden print:block"
        />
      ) : null}
    </RoleGuard>
  );
}
