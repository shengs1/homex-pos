"use client";

import { useEffect, useState } from "react";
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
import type { Pagination } from "@/types/api";
import type { Customer } from "@/types/domain";

const formSchema = z.object({ fullName: z.string().trim().min(1, "Họ tên không được để trống"), phone: z.string().trim().min(1, "SĐT không được để trống"), email: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")), address: z.string().trim().optional() });
type FormValues = z.infer<typeof formSchema>;

const PAGE_SIZE = 10;

function tierClassName(tier: string) {
  if (tier === "DIAMOND") return "border-blue-200 bg-blue-50 text-blue-700";
  if (tier === "GOLD") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function CustomersPage() {
  const { t } = useLanguage();
  const user = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const [items, setItems] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [editingItem, setEditingItem] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [errorMessage, setErrorMessage] = useState("");
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { fullName: "", phone: "", email: "", address: "" } });

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const vipCustomersCount = allCustomers.filter(c => c.tier === "GOLD" || c.tier === "DIAMOND").length;
  const totalPointsCount = allCustomers.reduce((sum, c) => sum + (c.points || 0), 0);

  async function loadData(currentPage = page) {
    try { 
      setIsLoading(true); setErrorMessage(""); 
      const [data, allData] = await Promise.all([
        customerService.list({ page: currentPage, limit: PAGE_SIZE, search, status }),
        customerService.list({ page: 1, limit: 1000 })
      ]);
      setItems(data.items); 
      setPagination(data.pagination); 
      setAllCustomers(allData.items);
    }
    catch (error) { setErrorMessage(getApiErrorMessage(error)); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { loadData(page); }, [page, status]);
  function openCreateForm() { setEditingItem(null); form.reset({ fullName: "", phone: "", email: "", address: "" }); setIsFormOpen(true); }
  function openEditForm(item: Customer) { setEditingItem(item); form.reset({ fullName: item.fullName, phone: item.phone, email: item.email || "", address: item.address || "" }); setIsFormOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function onSubmit(values: FormValues) {
    try { setErrorMessage(""); if (editingItem) { await customerService.update(editingItem.id, values); toast.success(t("message.updated")); } else { await customerService.create(values); toast.success(t("message.created")); } setIsFormOpen(false); await loadData(page); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
  }
  async function handleDelete(item: Customer) { if (!isAdmin || !window.confirm(t("customers.deleteConfirm", { name: item.fullName }))) return; try { await customerService.remove(item.id); toast.success(t("message.deleted")); await loadData(page); } catch (error) { toast.error(getApiErrorMessage(error)); } }
  async function handleRestore(item: Customer) { if (!isAdmin || !window.confirm(t("customers.restoreConfirm", { name: item.fullName }))) return; try { await customerService.restore(item.id); toast.success(t("message.restored")); await loadData(page); } catch (error) { toast.error(getApiErrorMessage(error)); } }
  async function exportCustomersCsv() { try { const data = await customerService.list({ page: 1, limit: 1000, search, status }); const rows = [["fullName", "phone", "email", "points", "tier", "status"], ...data.items.map((item) => [item.fullName, item.phone, item.email || "", String(item.points), item.tier || "SILVER", item.status])]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "customers.csv"; link.click(); URL.revokeObjectURL(url); } catch (error) { toast.error(getApiErrorMessage(error)); } }
  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); loadData(1); }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="space-y-6">
        <PageHeader title={t("customers.title")} description={t("customers.description")}><Button onClick={openCreateForm}><Plus className="h-4 w-4" />{t("customers.add")}</Button></PageHeader>
        <ErrorState message={errorMessage} />
        
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">Tổng khách hàng</p>
              <p className="text-2xl font-black text-slate-900">{formatNumber(allCustomers.length)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Tổng số khách đã lưu trên hệ thống</p>
            </div>
            <Crown className="h-8 w-8 text-slate-300" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">Khách hàng hoạt động</p>
              <p className="text-2xl font-black text-emerald-600">{formatNumber(allCustomers.filter(c => c.status === "ACTIVE").length)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Khách hàng đang có thể mua hàng</p>
            </div>
            <Crown className="h-8 w-8 text-emerald-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">Tổng điểm</p>
              <p className="text-2xl font-black text-blue-600">{formatNumber(totalPointsCount)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Tổng điểm tích lũy hiện có</p>
            </div>
            <Crown className="h-8 w-8 text-blue-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">Khách hàng VIP</p>
              <p className="text-2xl font-black text-amber-600">{formatNumber(vipCustomersCount)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Khách đạt hạng cao trong hệ thống</p>
            </div>
            <Crown className="h-8 w-8 text-amber-500/50" />
          </div>
        </div>

        <Card><CardContent className="pt-6"><form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_180px_auto_auto]"><Input placeholder={t("customers.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ACTIVE">{t("status.ACTIVE")}</option><option value="INACTIVE">{t("status.INACTIVE")}</option><option value="">{t("common.all")}</option></Select><Button type="submit">{t("common.search")}</Button><Button type="button" variant="outline" onClick={exportCustomersCsv}><Download className="h-4 w-4" />{t("common.export")}</Button></form></CardContent></Card>
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
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
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
                    <Th>{t("common.status")}</Th>
                    <Th>{t("common.updatedAt")}</Th>
                    <Th className="text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
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
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${tierClassName(item.tier || "SILVER")}`}>
                          <Crown className="h-3 w-3" />
                          {t(`customerTier.${item.tier || "SILVER"}`)}
                        </span>
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
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}


