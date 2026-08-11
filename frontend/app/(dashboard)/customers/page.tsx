"use client";

import { useEffect, useState, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Crown, Download, Edit, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RoleGuard } from "@/components/auth/role-guard";
import { ActionMenu } from "@/components/shared/action-menu";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { customerService } from "@/services/homex.service";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/domain";

type FormValues = { fullName: string; phone: string; email?: string; address?: string };

const PAGE_SIZE = 10;
const POINT_TO_SPEND_RATE = 10;
const TIER_TARGETS = [
  { tier: "SILVER", labelKey: "customerTier.SILVER", points: 200 },
  { tier: "GOLD", labelKey: "customerTier.GOLD", points: 1000 },
  { tier: "DIAMOND", labelKey: "customerTier.DIAMOND", points: 3000 },
] as const;

function tierClassName(tier: string | null | undefined) {
  const t = String(tier || "NONE").toUpperCase().trim();
  if (t === "DIAMOND") return "border-blue-200 bg-blue-50 text-blue-700";
  if (t === "GOLD") return "border-amber-200 bg-amber-50 text-amber-700";
  if (t === "SILVER") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function formatExactVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)} VND`;
}

function getNextTierProgress(points: number, tier: string | null | undefined) {
  const currentTier = String(tier || "NONE").toUpperCase().trim();
  const nextTier =
    currentTier === "NONE" || currentTier === ""
      ? TIER_TARGETS[0]
      : currentTier === "SILVER"
        ? TIER_TARGETS[1]
        : currentTier === "GOLD"
          ? TIER_TARGETS[2]
          : null;

  if (!nextTier) return null;

  const currentPoints = Math.max(points, 0);
  const remainingPoints = Math.max(nextTier.points - currentPoints, 0);

  return {
    nextTier,
    remainingPoints,
    remainingSpend: remainingPoints * POINT_TO_SPEND_RATE,
    progressPercent: Math.min(100, Math.max(0, (currentPoints / nextTier.points) * 100)),
  };
}

export default function CustomersPage() {
  const { t } = useLanguage();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const user = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [editingItem, setEditingItem] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [errorMessage, setErrorMessage] = useState("");
  const customerFormSchema = useMemo(() => z.object({ fullName: z.string().trim().min(1, t("customers.fullNameRequired")), phone: z.string().trim().min(1, t("customers.phoneRequired")), email: z.string().trim().email(t("customers.emailInvalid")).optional().or(z.literal("")), address: z.string().trim().optional() }), [t]);
  const form = useForm<FormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: { fullName: "", phone: "", email: "", address: "" } });

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>("");

  const vipCustomersCount = allCustomers.filter(c => c.tier === "GOLD" || c.tier === "DIAMOND").length;
  const totalPointsCount = allCustomers.reduce((sum, c) => sum + (c.points || 0), 0);

  async function loadData() {
    try { 
      setIsLoading(true); setErrorMessage(""); 
      const data = await customerService.list({ page: 1, limit: 1000, status });
      setAllCustomers(data.items);
    }
    catch (error) { setErrorMessage(getApiErrorMessage(error)); }
    finally { setIsLoading(false); }
  }

  // Calculate counts for each tier dynamically from allCustomers matching search
  const filteredForCounts = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    return allCustomers.filter(c => {
      if (searchLower) {
        const matchName = c.fullName.toLowerCase().includes(searchLower);
        const matchPhone = c.phone.includes(searchLower);
        const matchEmail = c.email ? c.email.toLowerCase().includes(searchLower) : false;
        if (!matchName && !matchPhone && !matchEmail) return false;
      }
      return true;
    });
  }, [allCustomers, search]);

  const counts = useMemo(() => {
    return {
      ALL: filteredForCounts.length,
      NONE: filteredForCounts.filter(c => (c.tier || "NONE") === "NONE").length,
      SILVER: filteredForCounts.filter(c => c.tier === "SILVER").length,
      GOLD: filteredForCounts.filter(c => c.tier === "GOLD").length,
      DIAMOND: filteredForCounts.filter(c => c.tier === "DIAMOND").length,
    };
  }, [filteredForCounts]);

  const filteredCustomers = useMemo(() => {
    let result = filteredForCounts;
    if (selectedTier) {
      result = result.filter(c => (c.tier || "NONE") === selectedTier);
    }
    return result;
  }, [filteredForCounts, selectedTier]);

  const displayItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredCustomers.slice(start, start + PAGE_SIZE);
  }, [filteredCustomers, page]);

  const localPagination = useMemo(() => {
    const totalItems = filteredCustomers.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    return {
      page,
      limit: PAGE_SIZE,
      totalItems,
      totalPages,
    };
  }, [filteredCustomers, page]);

  useEffect(() => { loadData(); }, [status]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedTier, search]);

  function openCreateForm() { setEditingItem(null); form.reset({ fullName: "", phone: "", email: "", address: "" }); setIsFormOpen(true); }
  function openEditForm(item: Customer) { setEditingItem(item); form.reset({ fullName: item.fullName, phone: item.phone, email: item.email || "", address: item.address || "" }); setIsFormOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function onSubmit(values: FormValues) {
    try { setErrorMessage(""); if (editingItem) { await customerService.update(editingItem.id, values); toast.success(t("message.updated")); } else { await customerService.create(values); toast.success(t("message.created")); } setIsFormOpen(false); await loadData(); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
  }
  async function handleDelete(item: Customer) { if (!isAdmin || !(await confirm({ description: t("customers.deleteConfirm", { name: item.fullName }), destructive: true }))) return; try { await customerService.remove(item.id); toast.success(t("message.deleted")); await loadData(); } catch (error) { toast.error(getApiErrorMessage(error)); } }
  async function handleRestore(item: Customer) { if (!isAdmin || !(await confirm({ description: t("customers.restoreConfirm", { name: item.fullName }) }))) return; try { await customerService.restore(item.id); toast.success(t("message.restored")); await loadData(); } catch (error) { toast.error(getApiErrorMessage(error)); } }
  async function exportCustomersCsv() { try { const data = await customerService.list({ page: 1, limit: 1000, search, status }); const rows = [["fullName", "phone", "email", "points", "tier", "status"], ...data.items.map((item) => [item.fullName, item.phone, item.email || "", String(item.points), item.tier || "SILVER", item.status])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "customers.csv"; link.click(); URL.revokeObjectURL(url); } catch (error) { toast.error(getApiErrorMessage(error)); } }
  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); void loadData(); }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="space-y-6">
        {ConfirmDialog}
        <PageHeader title={t("customers.title")} description={t("customers.description")}><Button onClick={openCreateForm}><Plus className="h-4 w-4" />{t("customers.add")}</Button></PageHeader>
        <ErrorState message={errorMessage} />
        
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("customers.totalCustomers")}</p>
              <p className="text-2xl font-black text-slate-900">{formatNumber(allCustomers.length)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalCustomersDesc")}</p>
            </div>
            <Crown className="h-8 w-8 text-slate-300" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("customers.activeCustomers")}</p>
              <p className="text-2xl font-black text-emerald-600">{formatNumber(allCustomers.filter(c => c.status === "ACTIVE").length)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.activeCustomersDesc")}</p>
            </div>
            <Crown className="h-8 w-8 text-emerald-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("customers.totalPoints")}</p>
              <p className="text-2xl font-black text-blue-600">{formatNumber(totalPointsCount)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalPointsDesc")}</p>
            </div>
            <Crown className="h-8 w-8 text-blue-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("customers.vipCustomers")}</p>
              <p className="text-2xl font-black text-amber-600">{formatNumber(vipCustomersCount)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.vipCustomersDesc")}</p>
            </div>
            <Crown className="h-8 w-8 text-amber-500/50" />
          </div>
        </div>

        <Card><CardContent className="pt-6"><form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_180px_auto_auto]"><Input placeholder={t("customers.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ACTIVE">{t("status.ACTIVE")}</option><option value="INACTIVE">{t("status.INACTIVE")}</option><option value="">{t("common.all")}</option></Select><Button type="submit">{t("common.search")}</Button><Button type="button" variant="outline" onClick={exportCustomersCsv}><Download className="h-4 w-4" />{t("common.export")}</Button></form></CardContent></Card>

        {/* Quick Filter Tabs */}
        <div className="flex flex-wrap gap-2 pb-1 overflow-x-auto no-scrollbar">
          <style>{`
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
            .no-scrollbar {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
          `}</style>
          {[
            { id: "", label: t("common.all"), count: counts.ALL },
            { id: "NONE", label: t("customerTier.NONE"), count: counts.NONE },
            { id: "SILVER", label: t("customerTier.SILVER"), count: counts.SILVER },
            { id: "GOLD", label: t("customerTier.GOLD"), count: counts.GOLD },
            { id: "DIAMOND", label: t("customerTier.DIAMOND"), count: counts.DIAMOND },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTier(tab.id)}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-full border transition duration-200 cursor-pointer shadow-sm",
                selectedTier === tab.id
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-2xl bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
            <DialogHeader>
              <DialogTitle>{editingItem ? t("customers.updateTitle") : t("customers.createTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2 mt-2">
              <div className="space-y-2">
                <Label>{t("customers.fullName")}</Label>
                <Input {...form.register("fullName")} />
                {form.formState.errors.fullName ? <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("common.phone")}</Label>
                <Input {...form.register("phone")} />
                {form.formState.errors.phone ? <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("common.email")}</Label>
                <Input {...form.register("email")} />
                {form.formState.errors.email ? <p className="text-sm text-destructive">{form.formState.errors.email.message}</p> : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("customers.address")}</Label>
                <Textarea {...form.register("address")} />
              </div>
              <div className="flex gap-2 md:col-span-2 justify-end">
                <Button variant="outline" type="button" onClick={() => setIsFormOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>{editingItem ? t("common.saveChanges") : t("common.createNew")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {isLoading ? <LoadingState /> : null}
        {!isLoading && displayItems.length === 0 ? <EmptyState /> : null}
        {!isLoading && displayItems.length > 0 ? (
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              <DataTable className="rounded-none border-0 shadow-none">
                <thead>
                  <tr>
                    <Th className="w-[90px] whitespace-nowrap">{t("common.no")}</Th>
                    <Th>{t("customers.title")}</Th>
                    <Th>{t("common.phone")}</Th>
                    <Th>{t("common.email")}</Th>
                    <Th>{t("customers.points")}</Th>
                    <Th>{t("customers.tier")}</Th>
                    <Th className="min-w-[220px]">{t("customers.nextTier")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th>{t("common.updatedAt")}</Th>
                    <Th className="text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, index) => (
                    <tr key={item.id}>
                      <Td className="font-medium">{(page - 1) * PAGE_SIZE + index + 1}</Td>
                      <Td>
                        <div className="font-medium">{item.fullName}</div>
                        <div className="text-xs text-muted-foreground">{item.address || "-"}</div>
                      </Td>
                      <Td>{item.phone}</Td>
                      <Td>{item.email || "-"}</Td>
                      <Td>{formatNumber(item.points)}</Td>
                      <Td>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${tierClassName(item.tier)}`}>
                          <Crown className="h-3 w-3" />
                          {t(`customerTier.${item.tier || "NONE"}`)}
                        </span>
                      </Td>
                      <Td>
                        {(() => {
                          const progress = getNextTierProgress(item.points || 0, item.tier);

                          if (!progress) {
                            return <span className="text-xs font-semibold text-slate-400">{t("customers.maxTier")}</span>;
                          }

                          return (
                            <div className="min-w-[180px] max-w-[220px] space-y-1.5">
                              <p className="text-xs font-semibold text-slate-700">
                                {t("customers.nextTierRequirement", { tier: t(progress.nextTier.labelKey), points: formatNumber(progress.remainingPoints) })}
                              </p>
                              <p className="text-xs text-slate-500">{t("customers.nextTierSpend", { amount: formatExactVnd(progress.remainingSpend) })}</p>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${progress.progressPercent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </Td>
                      <Td><StatusBadge status={item.status} /></Td>
                      <Td>{formatDateTime(item.updatedAt)}</Td>
                      <Td className="text-right">
                        {isAdmin ? (
                          <ActionMenu
                            label={t("common.actions")}
                            items={[
                              { label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(item) },
                              item.status === "ACTIVE"
                                ? { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item), variant: "destructive" }
                                : { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item) }
                            ]}
                          />
                        ) : "-"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        ) : null}
        <PaginationControls pagination={localPagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}


