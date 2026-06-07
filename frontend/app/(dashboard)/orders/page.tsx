"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, PlayCircle, XCircle } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTimePartsVN } from "@/lib/date-format";
import { formatCurrency } from "@/lib/format";
import { orderService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Order } from "@/types/domain";

function DateTimeCell({ value }: { value: string | Date | null | undefined }) {
  const parts = formatDateTimePartsVN(value);

  return (
    <div className="leading-6">
      <div>{parts.time}</div>
      <div>{parts.date}</div>
    </div>
  );
}

const POS_RESUME_DRAFT_ORDER_ID_KEY = "homex_pos_resume_draft_order_id";

const PAGE_SIZE = 10;
const FETCH_PAGE_SIZE = 100;

type OrderListFilters = {
  search: string;
  status: string;
};

function getCreatedAtTime(value: string | Date | undefined | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortByCreatedAtDesc<T extends { id: number; createdAt?: string | Date | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const timeDiff = getCreatedAtTime(b.createdAt) - getCreatedAtTime(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return b.id - a.id;
  });
}

async function fetchAllOrdersForCreatedAtDesc(filters: OrderListFilters) {
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

  if (totalPages === 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => {
      return orderService.list({ ...baseParams, page: index + 2, limit: FETCH_PAGE_SIZE });
    })
  );

  return firstPage.items.concat(remainingPages.flatMap((pageData) => pageData.items));
}

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const user = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function scrollToDetail() { window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const allOrders = await fetchAllOrdersForCreatedAtDesc({ search, status });
      const sortedOrders = sortByCreatedAtDesc(allOrders);
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
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(id: number) {
    try { setErrorMessage(""); const data = await orderService.detail(id); setSelectedOrder(data); scrollToDetail(); }
    catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  async function handleCancel(order: Order) {
    if (!isAdmin || !window.confirm(t("orders.cancelConfirm", { code: order.orderCode }))) return;
    try { await orderService.cancel(order.id); await loadData(page); await loadDetail(order.id); }
    catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  async function handleContinuePayment(order: Order) {
    try {
      setErrorMessage("");
      const detail = await orderService.detail(order.id);

      if (detail.status !== "DRAFT") {
        setErrorMessage("Chỉ đơn hàng nháp mới được tiếp tục thanh toán.");
        return;
      }

      window.localStorage.setItem(POS_RESUME_DRAFT_ORDER_ID_KEY, String(detail.id));
      router.push("/pos");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  useEffect(() => { loadData(page); }, [page, status]);
  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); loadData(1); }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="space-y-6">
        <PageHeader title={t("orders.title")} description={t("orders.description")} />
        <ErrorState message={errorMessage} />
        <Card><CardContent className="pt-6"><form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_200px_auto]"><Input placeholder={t("orders.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">{t("common.allStatus")}</option><option value="DRAFT">{t("status.DRAFT")}</option><option value="COMPLETED">{t("status.COMPLETED")}</option><option value="CANCELLED">{t("status.CANCELLED")}</option></Select><Button type="submit">{t("common.search")}</Button></form></CardContent></Card>
        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? <DataTable><thead><tr><Th>{t("orders.orderCode")}</Th><Th>{t("orders.customer")}</Th><Th>{t("orders.cashier")}</Th><Th>{t("orders.total")}</Th><Th>{t("common.status")}</Th><Th>{t("orders.createdAt")}</Th><Th className="text-right">{t("common.actions")}</Th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><Td className="font-medium">{item.orderCode}</Td><Td>{item.customer?.fullName || t("customers.retail")}</Td><Td>{item.user?.fullName || item.userId}</Td><Td>{formatCurrency(item.totalAmount)}</Td><Td><StatusBadge status={item.status} /></Td><Td><DateTimeCell value={item.createdAt} /></Td><Td className="text-right"><ActionMenu label={t("common.actions")} items={[{ label: t("common.detail"), icon: <Eye className="h-4 w-4" />, onClick: () => loadDetail(item.id) }, ...(item.status === "DRAFT" ? [{ label: "Tiếp tục thanh toán", icon: <PlayCircle className="h-4 w-4" />, onClick: () => handleContinuePayment(item) }] : []), ...(isAdmin ? [{ label: t("common.cancel"), icon: <XCircle className="h-4 w-4" />, onClick: () => handleCancel(item), variant: "destructive" as const, disabled: item.status === "CANCELLED" }] : [])]} /></Td></tr>)}</tbody></DataTable> : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />
        <div ref={detailRef}>{selectedOrder ? <Card><CardHeader><CardTitle>{t("orders.detailTitle", { code: selectedOrder.orderCode })}</CardTitle></CardHeader><CardContent className="space-y-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><p className="text-sm font-semibold">{t("orders.customer")}</p><p>{selectedOrder.customer?.fullName || t("customers.retail")}</p></div><div><p className="text-sm font-semibold">{t("orders.cashier")}</p><p>{selectedOrder.user?.fullName || selectedOrder.userId}</p></div><div><p className="text-sm font-semibold">{t("orders.total")}</p><p>{formatCurrency(selectedOrder.totalAmount)}</p></div><div><p className="text-sm font-semibold">{t("common.status")}</p><StatusBadge status={selectedOrder.status} /></div></div><div><h3 className="mb-3 font-semibold">{t("orders.items")}</h3><DataTable noHorizontalScroll><colgroup><col className="w-[45%]" /><col className="w-[15%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup><thead><tr><Th>{t("products.product")}</Th><Th>{t("inventory.quantity")}</Th><Th>{t("products.salePrice")}</Th><Th>{t("orders.total")}</Th></tr></thead><tbody>{selectedOrder.orderDetails.map((detail) => <tr key={detail.id}><Td><div className="break-words font-medium">{detail.product?.name || detail.productId}</div><div className="truncate text-xs text-muted-foreground">{detail.product?.sku || "-"}</div></Td><Td>{detail.quantity}</Td><Td>{formatCurrency(detail.unitPrice)}</Td><Td>{formatCurrency(detail.lineTotal)}</Td></tr>)}</tbody></DataTable></div><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>{t("orders.payment")}</CardTitle></CardHeader><CardContent>{selectedOrder.payment ? <div className="space-y-2"><p>{t(`paymentMethod.${selectedOrder.payment.method}`)}</p><p>{formatCurrency(selectedOrder.payment.amount)}</p><StatusBadge status={selectedOrder.payment.status} /></div> : <p className="text-sm text-muted-foreground">{t("orders.noPayment")}</p>}</CardContent></Card><Card><CardHeader><CardTitle>{t("orders.warranty")}</CardTitle></CardHeader><CardContent className="space-y-2">{selectedOrder.orderDetails.flatMap((detail) => detail.warranty ? [detail.warranty] : []).length === 0 ? <p className="text-sm text-muted-foreground">-</p> : selectedOrder.orderDetails.map((detail) => detail.warranty ? <div key={detail.warranty.id} className="rounded-lg border p-3"><p className="font-medium">{detail.warranty.warrantyCode}</p><StatusBadge status={detail.warranty.status} /></div> : null)}</CardContent></Card></div></CardContent></Card> : null}</div>
      </div>
    </RoleGuard>
  );
}
