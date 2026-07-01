"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleDollarSign, DoorClosed, DoorOpen, RefreshCw, Scale, Clock, Unlock, Lock, Wallet } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
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
import { useToast } from "@/contexts/toast-context";
import { getApiErrorMessage } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { shiftService, userService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Shift, UserAccount } from "@/types/domain";

const PAGE_SIZE = 10;

type ShiftSummary = {
  totalShifts: number;
  openShifts: number;
  closedShifts: number;
  totalCashInDrawer: number;
  totalDifference: number;
};

const EMPTY_SHIFT_SUMMARY: ShiftSummary = {
  totalShifts: 0,
  openShifts: 0,
  closedShifts: 0,
  totalCashInDrawer: 0,
  totalDifference: 0,
};

function numberFromInput(value: string) {
  const normalizedValue = value.replace(/[^\d]/g, "");
  return normalizedValue ? Number(normalizedValue) : 0;
}

function displayShiftDate(value: string | null) {
  return value ? formatDateTime(value) : "-";
}

export default function ShiftsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<Shift[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary>(EMPTY_SHIFT_SUMMARY);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [shiftType, setShiftType] = useState<"MORNING" | "EVENING">("MORNING");
  const [closingCash, setClosingCash] = useState("");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const currentUser = getAuthUser();
  const isAdmin = currentUser?.role === "ADMIN";

  const latestClosedShift = useMemo(() => items.find((item) => item.status === "CLOSED"), [items]);
  const personalDiscrepancy = currentShift?.discrepancyAmount ?? latestClosedShift?.discrepancyAmount ?? 0;

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const promises: [Promise<Shift | null>, Promise<{ items: Shift[]; pagination: Pagination; summary?: ShiftSummary }>, Promise<{ items: UserAccount[] }> | null] = [
        shiftService.current(),
        shiftService.list({ page: currentPage, limit: PAGE_SIZE, status }),
        isAdmin ? userService.list({ page: 1, limit: 100 }) : null
      ];
      const [current, listData, usersData] = await Promise.all(promises);
      setCurrentShift(current);
      setItems(listData.items);
      setPagination(listData.pagination);
      setShiftSummary({ ...EMPTY_SHIFT_SUMMARY, ...(listData.summary || {}) });
      if (usersData) {
        setUsersList(usersData.items);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, status]);

  async function handleOpenShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      const shift = await shiftService.open({
        openingCash: numberFromInput(openingCash),
        note: note.trim() || undefined,
        shiftType: isAdmin ? shiftType : new Date().getHours() < 14 ? "MORNING" : "EVENING",
        userId: selectedUserId ? Number(selectedUserId) : undefined,
      });
      setOpeningCash("0");
      setNote("");
      setSelectedUserId("");
      setShiftType("MORNING");
      toast.success(t("shifts.opened"));
      await loadData(1);
      setPage(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCloseShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentShift) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      const shift = await shiftService.close(currentShift.id, {
        closingCash: numberFromInput(closingCash),
        note: note.trim() || undefined,
      });
      setCurrentShift(null);
      setClosingCash("");
      setNote("");
      toast.success(t("shifts.closed", { amount: formatCurrency(shift.discrepancyAmount || 0) }));
      await loadData(1);
      setPage(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="min-w-0 space-y-5">
        <PageHeader title={isAdmin ? t("shifts.adminTitle") : t("shifts.cashierTitle")} description={t("shifts.description")}>
          <Button type="button" variant="outline" onClick={() => loadData(page)} disabled={isLoading}>
            <RefreshCw className="h-4 w-4" />
            {t("shifts.refresh")}
          </Button>
        </PageHeader>

        <ErrorState message={errorMessage} />

        {isAdmin ? (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.totalShifts")}</p>
                <p className="text-2xl font-black text-slate-900">{formatNumber(shiftSummary.totalShifts)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.allEmployeeShifts")}</p>
              </div>
              <Clock className="h-8 w-8 text-slate-300" />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.openShifts")}</p>
                <p className="text-2xl font-black text-emerald-600">{formatNumber(shiftSummary.openShifts)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.activeCashiersDesc")}</p>
              </div>
              <Unlock className="h-8 w-8 text-emerald-500/50" />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.totalCashInDrawer")}</p>
                <p className="text-2xl font-black text-amber-600">{formatCurrency(shiftSummary.totalCashInDrawer)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.cashInOpenDrawersDesc")}</p>
              </div>
              <Wallet className="h-8 w-8 text-amber-500/50" />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.totalDifference")}</p>
                <p className="text-2xl font-black text-rose-600">{formatCurrency(shiftSummary.totalDifference)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.systemDifferenceDesc")}</p>
              </div>
              <Scale className="h-8 w-8 text-rose-500/50" />
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.shiftStatus")}</p>
                <p className={`text-2xl font-black ${currentShift ? "text-emerald-600" : "text-rose-600"}`}>{currentShift ? t("shifts.currentOpen") : t("shifts.noOpen")}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.currentStatusDesc")}</p>
              </div>
              {currentShift ? <Unlock className="h-8 w-8 text-emerald-500/50" /> : <Lock className="h-8 w-8 text-rose-500/50" />}
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.openingCash")}</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(currentShift?.openingCash || 0)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.openingCashDesc")}</p>
              </div>
              <CircleDollarSign className="h-8 w-8 text-slate-300" />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.collectedRevenue")}</p>
                <p className="text-2xl font-black text-emerald-600">{formatCurrency(currentShift?.totalRevenue || 0)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.currentRevenueDesc")}</p>
              </div>
              <Wallet className="h-8 w-8 text-emerald-500/50" />
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">{t("shifts.personalDifference")}</p>
                <p className="text-2xl font-black text-rose-600">{formatCurrency(personalDiscrepancy)}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("shifts.latestPersonalDifferenceDesc")}</p>
              </div>
              <Scale className="h-8 w-8 text-rose-500/50" />
            </div>
          </div>
        )}

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black text-slate-800">
                <CircleDollarSign className="h-5 w-5 text-primary" />
                {isAdmin ? t("shifts.openForEmployee") : t("shifts.shiftStatus")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentShift ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="font-black text-emerald-800">{currentShift.user?.fullName || t("shifts.cashier")}</span>
                    <StatusBadge status={currentShift.status} />
                  </div>
                  <dl className="grid gap-2 text-xs font-semibold text-emerald-900">
                    <div className="flex justify-between gap-3"><dt>{t("shifts.openingCash")}</dt><dd>{formatCurrency(currentShift.openingCash)}</dd></div>
                    <div className="flex justify-between gap-3"><dt>{t("shifts.openedAt")}</dt><dd className="text-right">{displayShiftDate(currentShift.openedAt)}</dd></div>
                    <div className="flex justify-between gap-3"><dt>{t("common.note")}</dt><dd className="max-w-[180px] break-words whitespace-normal line-clamp-2 text-right">{currentShift.note || t("common.notAvailable")}</dd></div>
                  </dl>
                </div>
              ) : !isAdmin ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-700">{t("shifts.cashierNeedOpenShiftBeforeCheckout")}</div>
              ) : null}

              {currentShift ? (
                <form onSubmit={handleCloseShift} className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t("shifts.closingCash")}</Label>
                    <Input inputMode="numeric" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.note")}</Label>
                    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("shifts.notePlaceholder")} />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    <DoorClosed className="h-4 w-4" />
                    {t("shifts.close")}
                  </Button>
                </form>
              ) : isAdmin ? (
                <form onSubmit={handleOpenShift} className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t("shifts.selectEmployee")}</Label>
                    <Select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} required>
                      <option value="">{t("shifts.selectEmployee")}</option>
                      {usersList.filter(u => u.status === "ACTIVE").map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName} ({u.role.name})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("shifts.shiftType")}</Label>
                    <Select value={shiftType} onChange={(event) => setShiftType(event.target.value as "MORNING" | "EVENING")} required>
                      <option value="MORNING">{t("shifts.MORNING")}</option>
                      <option value="EVENING">{t("shifts.EVENING")}</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("shifts.openingCash")}</Label>
                    <Input inputMode="numeric" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.note")}</Label>
                    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("shifts.notePlaceholder")} />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    <DoorOpen className="h-4 w-4" />
                    {t("shifts.open")}
                  </Button>
                </form>
              ) : (
                <div className="rounded-xl border border-dashed bg-slate-50 p-6 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-500">{t("shifts.noOpen")}</p>
                  <p className="text-xs text-slate-400">{t("shifts.contactAdminToOpen")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
              <CardContent className="flex flex-wrap gap-3 pt-6">
                <Select className="max-w-[220px]" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                  <option value="">{t("common.allStatus")}</option>
                  <option value="OPEN">{t("status.OPEN")}</option>
                  <option value="CLOSED">{t("status.CLOSED")}</option>
                </Select>
                <Button type="button" onClick={() => loadData(1)}>{t("common.filter")}</Button>
                {isAdmin ? <span className="self-center text-xs font-semibold text-slate-500">{t("shifts.adminScope")}</span> : <span className="self-center text-xs font-semibold text-slate-500">{t("shifts.cashierScope")}</span>}
              </CardContent>
            </Card>

            {isLoading ? <LoadingState /> : null}
            {!isLoading && items.length === 0 ? <EmptyState message={t("shifts.empty")} /> : null}
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
                      <Td><div className="max-w-[180px] break-words whitespace-normal line-clamp-2 font-bold">{item.user?.fullName || item.userId}</div></Td>
                      <Td>{formatCurrency(item.openingCash)}</Td>
                      <Td>{item.closingCash === null ? "-" : formatCurrency(item.closingCash)}</Td>
                      <Td>{item.expectedCash === null ? "-" : formatCurrency(item.expectedCash)}</Td>
                      <Td className={item.discrepancyAmount ? "font-semibold text-destructive" : ""}>{item.discrepancyAmount === null ? "-" : formatCurrency(item.discrepancyAmount)}</Td>
                      <Td><StatusBadge status={item.status} /></Td>
                      <Td>{displayShiftDate(item.openedAt)}</Td>
                      <Td>{displayShiftDate(item.closedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : null}
            <PaginationControls pagination={pagination} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}






