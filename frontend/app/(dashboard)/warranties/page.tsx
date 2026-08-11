"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, MoreHorizontal, RotateCcw, Search, ShieldAlert, ShieldCheck, ShieldOff, Shield, ShieldX, TimerOff, Mail, Link } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateVN } from "@/lib/date-format";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { orderService, warrantyService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Order, OrderDetail, Warranty } from "@/types/domain";

type WarrantyActionItem = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
};

const PAGE_SIZE = 10;
const FETCH_PAGE_SIZE = 100;

type WarrantyListFilters = {
  search: string;
  status: string;
  fromDate: string;
  toDate: string;
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

async function fetchAllWarrantiesForCreatedAtDesc(filters: WarrantyListFilters) {
  const baseParams = {
    search: filters.search,
    status: filters.status,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    sortBy: "createdAt",
    sortOrder: "desc",
    orderBy: "createdAt",
    order: "desc",
  };

  const firstPage = await warrantyService.list({ ...baseParams, page: 1, limit: FETCH_PAGE_SIZE });
  const totalPages = Math.max(1, firstPage.pagination?.totalPages || 1);

  if (totalPages === 1) {
    return firstPage.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => {
      return warrantyService.list({ ...baseParams, page: index + 2, limit: FETCH_PAGE_SIZE });
    })
  );

  return firstPage.items.concat(remainingPages.flatMap((pageData) => pageData.items));
}

function WarrantyActionMenu({ label, items }: { label: string; items: WarrantyActionItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 min-w-9" title={label} aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-52">
          {items.map((item) => (
            <DropdownMenuItem
            key={item.label}
            onClick={item.onClick}
            disabled={item.disabled}
            className={cn(item.variant === "destructive" && "text-destructive hover:text-destructive")}
          >
            {item.icon}
            <span>{item.label}</span>
          </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

function buildOrderDetailLabel(orderDetail: OrderDetail) {
  const productName = orderDetail.product?.name || `#${orderDetail.productId}`;
  return `${productName} · SL ${orderDetail.quantity} · ${formatCurrency(orderDetail.lineTotal)}`;
}

export default function WarrantiesPage() {
  const { t } = useLanguage();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const user = useCurrentUser();
  const detailRef = useRef<HTMLDivElement | null>(null);

  async function handleSendEmail(item: Warranty) {
    try {
      setIsLoading(true);
      await warrantyService.sendEmail(item.id);
      toast.success(t("warranties.emailSent"));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopyLink(item: Warranty) {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/tra-cuu-bao-hanh?code=${item.warrantyCode}`;
      void navigator.clipboard.writeText(url);
      toast.success(t("warranties.lookupLinkCopied"));
    }
  }

  async function handleResetFilters() {
    setSearch("");
    setStatus("");
    setFromDate("");
    setToDate("");
    setPage(1);
    try {
      setIsLoading(true);
      setErrorMessage("");
      const allWarranties = await fetchAllWarrantiesForCreatedAtDesc({ search: "", status: "", fromDate: "", toDate: "" });
      const sortedWarranties = sortByCreatedAtDesc(allWarranties);
      const pageItems = sortedWarranties.slice(0, PAGE_SIZE);
      const totalItems = sortedWarranties.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

      setItems(pageItems);
      setAllItems(allWarranties);
      setPagination({
        page: 1,
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
  const [items, setItems] = useState<Warranty[]>([]);
  const [allItems, setAllItems] = useState<Warranty[]>([]);
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [manualOrderCode, setManualOrderCode] = useState("");
  const [manualOrder, setManualOrder] = useState<Order | null>(null);
  const [manualOrderDetailId, setManualOrderDetailId] = useState("");
  const [manualStartDate, setManualStartDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isManualOrderLoading, setIsManualOrderLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);

  const manualOrderDetails = useMemo(() => {
    if (!manualOrder?.orderDetails) return [];
    return manualOrder.orderDetails.filter((detail) => detail.status !== "INACTIVE");
  }, [manualOrder]);

  const stats = useMemo(() => {
    const active = allItems.filter(item => item.status === "ACTIVE").length;
    const expiringSoon = allItems.filter(item => {
      if (item.status !== "ACTIVE" || !item.endDate) return false;
      const end = new Date(item.endDate);
      const now = new Date();
      const diffTime = end.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 30 && diffDays >= 0;
    }).length;
    const expired = allItems.filter(item => item.status === "EXPIRED").length;
    const cancelled = allItems.filter(item => item.status === "CANCELLED").length;
    return {
      total: allItems.length,
      active,
      expiringSoon,
      expired,
      cancelled
    };
  }, [allItems]);

  function scrollToDetail() {
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const allWarranties = await fetchAllWarrantiesForCreatedAtDesc({ search, status, fromDate, toDate });
      const sortedWarranties = sortByCreatedAtDesc(allWarranties);
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const pageItems = sortedWarranties.slice(startIndex, startIndex + PAGE_SIZE);
      const totalItems = sortedWarranties.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

      setItems(pageItems);
      setAllItems(allWarranties);
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
      const data = await warrantyService.detail(id);
      setSelectedWarranty(data);
      scrollToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }


  async function searchManualOrder() {
    const orderCode = manualOrderCode.trim();
    if (!orderCode) {
      setErrorMessage(t("warranties.orderCodeRequired"));
      return;
    }

    try {
      setIsManualOrderLoading(true);
      setErrorMessage("");
      setManualOrder(null);
      setManualOrderDetailId("");

      const orderList = await orderService.list({ page: 1, limit: 10, search: orderCode });
      const matchedOrder = orderList.items.find((order) => order.orderCode.toLowerCase() === orderCode.toLowerCase()) || orderList.items[0];

      if (!matchedOrder) {
        setErrorMessage(t("warranties.orderNotFound"));
        return;
      }

      const orderDetail = await orderService.detail(matchedOrder.id);
      setManualOrder(orderDetail);
      toast.success(t("warranties.orderLoaded", { code: orderDetail.orderCode }));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsManualOrderLoading(false);
    }
  }

  async function createManualWarranty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!manualOrder) {
      setErrorMessage(t("warranties.searchOrderFirst"));
      return;
    }

    if (!manualOrderDetailId) {
      setErrorMessage(t("warranties.chooseOrderProduct"));
      return;
    }

    try {
      setErrorMessage("");
      await warrantyService.create({ orderDetailId: Number(manualOrderDetailId), startDate: manualStartDate || undefined });
      setManualOrderCode("");
      setManualOrder(null);
      setManualOrderDetailId("");
      setManualStartDate("");
      toast.success(t("warranties.manualCreated"));
      setIsManualFormOpen(false);
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleCancel(item: Warranty) {
    if (!(await confirm({ description: t("warranties.cancelConfirm", { code: item.warrantyCode }), destructive: true }))) return;

    try {
      setErrorMessage("");
      await warrantyService.cancel(item.id);
      await loadData(page);
      if (selectedWarranty?.id === item.id) await loadDetail(item.id);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleRestore(item: Warranty) {
    if (!(await confirm({ description: t("warranties.restoreConfirm", { code: item.warrantyCode }) }))) return;

    try {
      setErrorMessage("");
      await warrantyService.restore(item.id);
      await loadData(page);
      if (selectedWarranty?.id === item.id) await loadDetail(item.id);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleExpire(item: Warranty) {
    if (!(await confirm({ description: t("warranties.expireConfirm", { code: item.warrantyCode }), destructive: true }))) return;

    try {
      setErrorMessage("");
      await warrantyService.expire(item.id);
      await loadData(page);
      if (selectedWarranty?.id === item.id) await loadDetail(item.id);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, status]);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="w-full min-w-0 space-y-6 overflow-visible">
        {ConfirmDialog}
        <PageHeader title={t("warranties.title")} description={t("warranties.description")}>
          {user?.role === "ADMIN" && (
            <Button onClick={() => setIsManualFormOpen(true)} className="flex items-center gap-2">
              + {t("warranties.createManual")}
            </Button>
          )}
        </PageHeader>
        <ErrorState message={errorMessage} />

        {/* 5 stats cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("warranties.total")}</p>
              <p className="text-2xl font-black text-slate-900">{formatNumber(stats.total)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalWarrantiesDesc")}</p>
            </div>
            <Shield className="h-8 w-8 text-slate-300" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("warranties.active")}</p>
              <p className="text-2xl font-black text-emerald-600">{formatNumber(stats.active)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.activeWarrantiesDesc")}</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("warranties.expiringSoon")}</p>
              <p className="text-2xl font-black text-amber-600">{formatNumber(stats.expiringSoon)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.expiringWarrantiesDesc")}</p>
            </div>
            <ShieldAlert className="h-8 w-8 text-amber-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("warranties.expired")}</p>
              <p className="text-2xl font-black text-slate-600">{formatNumber(stats.expired)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.expiredWarrantiesDesc")}</p>
            </div>
            <ShieldOff className="h-8 w-8 text-slate-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("warranties.statusCancelled")}</p>
              <p className="text-2xl font-black text-rose-600">{formatNumber(stats.cancelled)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.cancelledWarrantiesDesc")}</p>
            </div>
            <ShieldX className="h-8 w-8 text-rose-500/50" />
          </div>
        </div>

        {/* Unified filter and lookup toolbar */}
        <Card className="w-full min-w-0">
          <CardContent className="pt-6">
            <form onSubmit={handleFilter} className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-end">
              <div className="lg:col-span-4 w-full">
                <Label className="mb-2 block">{t("common.search")}</Label>
                <Input
                  placeholder={t("warranties.searchPlaceholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="lg:col-span-2 w-full">
                <Label className="mb-2 block">{t("common.status")}</Label>
                <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                  <option value="">{t("common.allStatus")}</option>
                  <option value="ACTIVE">{t("status.ACTIVE")}</option>
                  <option value="EXPIRED">{t("status.EXPIRED")}</option>
                  <option value="CANCELLED">{t("status.CANCELLED")}</option>
                </Select>
              </div>
              <div className="lg:col-span-2 w-full">
                <DateFilterInput
                  label={t("reports.fromDate")}
                  value={fromDate}
                  onChange={setFromDate}
                  className="w-full"
                />
              </div>
              <div className="lg:col-span-2 w-full">
                <DateFilterInput
                  label={t("reports.toDate")}
                  value={toDate}
                  onChange={setToDate}
                  className="w-full"
                />
              </div>
              <div className="lg:col-span-2 w-full flex gap-2">
                <Button type="submit" className="flex-grow">{t("common.filter")}</Button>
                <Button type="button" variant="outline" className="flex-grow border-slate-200 hover:bg-slate-50 text-slate-700 font-medium" onClick={handleResetFilters}>
                  {t("common.reset")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Manual warranty Dialog */}
        {user?.role === "ADMIN" && (
          <Dialog open={isManualFormOpen} onOpenChange={setIsManualFormOpen}>
            <DialogContent className="max-w-2xl bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
              <DialogHeader>
                <DialogTitle>{t("warranties.createManual")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={createManualWarranty} className="space-y-5">
                
                <div className="space-y-2">
                  <div className="flex w-full flex-wrap items-end gap-4 md:flex-nowrap">
                    <div className="min-w-[260px] flex-1 space-y-2">
                      <Label>{t("warranties.orderCode")}</Label>
                      <Input
                        className="h-11"
                        placeholder={t("warranties.orderCodePlaceholder")}
                        value={manualOrderCode}
                        onChange={(event) => setManualOrderCode(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full shrink-0 md:w-auto"
                      onClick={searchManualOrder}
                      disabled={isManualOrderLoading}
                    >
                      <Search className="h-4 w-4" />
                      {isManualOrderLoading ? t("message.loading") : t("warranties.findOrder")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("warranties.orderCodeHint")}</p>
                </div>

                
                <div className="space-y-2">
                  <div className="flex w-full flex-wrap items-end gap-4 md:flex-nowrap">
                    <div className="min-w-[300px] flex-[1.4] space-y-2">
                      <Label>{t("warranties.chooseProductFromOrder")}</Label>
                      <Select
                        className="h-11"
                        value={manualOrderDetailId}
                        onChange={(event) => setManualOrderDetailId(event.target.value)}
                        disabled={!manualOrder || manualOrderDetails.length === 0}
                      >
                        <option value="">{manualOrder ? t("warranties.chooseProductPlaceholder") : t("warranties.searchOrderFirst")}</option>
                        {manualOrderDetails.map((detail) => (
                          <option key={detail.id} value={detail.id}>{buildOrderDetailLabel(detail)}</option>
                        ))}
                      </Select>
                    </div>
                    <DateFilterInput
                      label={t("warranties.startDate")}
                      value={manualStartDate}
                      onChange={setManualStartDate}
                      className="min-w-[190px]"
                      inputClassName="h-11"
                    />
                    <Button type="submit" className="h-11 w-full shrink-0 md:w-auto">
                      <ShieldCheck className="h-4 w-4" />
                      {t("common.create")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("warranties.hiddenOrderDetailHint")}</p>
                </div>

                {manualOrder ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <p className="font-semibold">{t("warranties.order")}</p>
                        <p className="break-words">{manualOrder.orderCode}</p>
                      </div>
                      <div>
                        <p className="font-semibold">{t("orders.customer")}</p>
                        <p className="break-words">{manualOrder.customer?.fullName || t("customers.retail")}</p>
                      </div>
                      <div>
                        <p className="font-semibold">{t("orders.total")}</p>
                        <p>{formatCurrency(manualOrder.totalAmount)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Warranty data table */}
        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable tableClassName="table-fixed w-full">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[24%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <Th className="px-3 whitespace-nowrap">{t("warranties.warrantyCode")}</Th>
                <Th className="px-3 whitespace-nowrap">{t("warranties.customer")}</Th>
                <Th className="px-3 whitespace-nowrap">{t("warranties.product")}</Th>
                <Th className="px-3 whitespace-nowrap">{t("warranties.startDate")}</Th>
                <Th className="px-3 whitespace-nowrap">{t("warranties.endDate")}</Th>
                <Th className="px-3 whitespace-nowrap">{t("common.status")}</Th>
                <Th className="min-w-[100px] px-3 text-right whitespace-nowrap">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td className="px-3"><div className="break-words whitespace-normal line-clamp-2 font-medium" title={item.warrantyCode}>{item.warrantyCode}</div></Td>
                  <Td className="px-3">
                    <div className="break-words whitespace-normal line-clamp-2 font-medium" title={item.customer?.fullName || String(item.customerId)}>{item.customer?.fullName || item.customerId}</div>
                    <div className="break-words whitespace-normal line-clamp-2 text-xs text-muted-foreground" title={item.customer?.phone || "-"}>{item.customer?.phone || "-"}</div>
                  </Td>
                  <Td className="px-3"><div className="line-clamp-2 break-words" title={item.orderDetail?.product?.name || "-"}>{item.orderDetail?.product?.name || item.orderDetail?.productId || "-"}</div></Td>
                  <Td className="px-3"><div className="break-words whitespace-normal line-clamp-2">{formatDateVN(item.startDate)}</div></Td>
                  <Td className="px-3"><div className="break-words whitespace-normal line-clamp-2">{formatDateVN(item.endDate)}</div></Td>
                  <Td className="px-3"><StatusBadge status={item.status} /></Td>
                  <Td className="min-w-[100px] px-3 pr-4 text-right">
                    <WarrantyActionMenu
                      label={t("common.actions")}
                      items={
                        user?.role === "CASHIER"
                          ? [
                              { label: t("warranties.lookupLink"), icon: <Link className="h-4 w-4" />, onClick: () => handleCopyLink(item) },
                            ]
                          : [
                              { label: t("common.detail"), icon: <Eye className="h-4 w-4" />, onClick: () => loadDetail(item.id) },
                              { label: t("warranties.lookupLink"), icon: <Link className="h-4 w-4" />, onClick: () => handleCopyLink(item) },
                              { label: t("warranties.sendEmail"), icon: <Mail className="h-4 w-4" />, onClick: () => handleSendEmail(item), disabled: !item.customer?.email },
                              { label: t("common.cancel"), icon: <ShieldX className="h-4 w-4" />, onClick: () => handleCancel(item), variant: "destructive", disabled: item.status === "CANCELLED" },
                              { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item), disabled: item.status === "ACTIVE" },
                              { label: t("common.expire"), icon: <TimerOff className="h-4 w-4" />, onClick: () => handleExpire(item), disabled: item.status === "EXPIRED" },
                            ]
                      }
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />

        {/* Selected warranty detail */}
        <div ref={detailRef}>
          {selectedWarranty ? (
            <Card className="w-full min-w-0">
              <CardHeader>
                <CardTitle>{t("warranties.detailTitle", { code: selectedWarranty.warrantyCode })}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div><p className="text-sm font-semibold">{t("warranties.customer")}</p><p className="break-words">{selectedWarranty.customer?.fullName || selectedWarranty.customerId}</p></div>
                <div><p className="text-sm font-semibold">{t("common.phone")}</p><p>{selectedWarranty.customer?.phone || "-"}</p></div>
                <div><p className="text-sm font-semibold">{t("warranties.product")}</p><p className="break-words">{selectedWarranty.orderDetail?.product?.name || "-"}</p></div>
                <div><p className="text-sm font-semibold">{t("warranties.order")}</p><p className="break-words">{selectedWarranty.orderDetail?.order?.orderCode || "-"}</p></div>
                <div><p className="text-sm font-semibold">{t("warranties.productValue")}</p><p>{formatCurrency(selectedWarranty.orderDetail?.lineTotal || 0)}</p></div>
                <div><p className="text-sm font-semibold">{t("common.status")}</p><StatusBadge status={selectedWarranty.status} /></div>
                <div><p className="text-sm font-semibold">{t("warranties.startDate")}</p><p>{formatDateVN(selectedWarranty.startDate)}</p></div>
                <div><p className="text-sm font-semibold">{t("warranties.endDate")}</p><p>{formatDateVN(selectedWarranty.endDate)}</p></div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </RoleGuard>
  );
}




