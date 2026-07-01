"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Plus, RotateCcw, Trash2, FolderTree, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { getApiErrorMessage } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { formatDateTime, formatNumber } from "@/lib/format";
import { categoryService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Category } from "@/types/domain";

const PAGE_SIZE = 10;

type FormValues = { name: string; description?: string };

export default function CategoriesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const formSchema = z.object({ name: z.string().trim().min(1, t("categories.nameRequired")), description: z.string().trim().optional() });
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", description: "" } });

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const [data, allData] = await Promise.all([
        categoryService.list({ page: currentPage, limit: PAGE_SIZE, search, status }),
        categoryService.list({ page: 1, limit: 1000 })
      ]);
      setItems(data.items);
      setPagination(data.pagination);
      setAllCategories(allData.items);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadData(page); }, [page, status]);

  function openCreateForm() { setEditingItem(null); form.reset({ name: "", description: "" }); setIsFormOpen(true); }
  function openEditForm(item: Category) { setEditingItem(item); form.reset({ name: item.name, description: item.description || "" }); setIsFormOpen(true); }

  async function onSubmit(values: FormValues) {
    try {
      if (editingItem) { await categoryService.update(editingItem.id, values); toast.success(t("common.success")); }
      else { await categoryService.create(values); toast.success(t("common.success")); }
      setIsFormOpen(false);
      await loadData(page);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  }

  async function handleDelete(item: Category) {
    if (!(await confirmAction({ description: t("categories.deleteConfirm", { name: item.name }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true }))) return;
    try { await categoryService.remove(item.id); toast.success(t("common.success")); await loadData(page); } catch (error) { toast.error(getApiErrorMessage(error)); }
  }

  async function handleRestore(item: Category) {
    if (!(await confirmAction({ description: t("categories.restoreConfirm", { name: item.name }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel") }))) return;
    try { await categoryService.restore(item.id); toast.success(t("common.success")); await loadData(page); } catch (error) { toast.error(getApiErrorMessage(error)); }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); loadData(1); }

  return (
    <div className="space-y-6">
      <PageHeader title={t("categories.title")} description={t("categories.description")}><Button onClick={openCreateForm}><Plus className="h-4 w-4" />{t("categories.add")}</Button></PageHeader>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("categories.totalCategories")}</p>
              <p className="text-2xl font-black text-slate-900">{formatNumber(allCategories.length)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {t("categories.totalCategoriesDesc")}
              </p>
            </div>
            <FolderTree className="h-8 w-8 text-slate-300" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("categories.activeCategories")}</p>
              <p className="text-2xl font-black text-emerald-600">{formatNumber(allCategories.filter((c) => c.status === "ACTIVE").length)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {t("categories.activeCategoriesDesc")}
              </p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
          </div>
      </div>

      <ErrorState message={errorMessage} />
      
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-3 w-full mb-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3 w-full">
          <Input 
            className="h-10 min-w-[240px] flex-1 text-sm border-slate-200" 
            placeholder={t("categories.searchPlaceholder")} 
            value={search} 
            onChange={(event) => setSearch(event.target.value)} 
          />
          <Select className="h-10 w-44 text-sm border-slate-200 rounded-lg px-2 text-slate-600 bg-white" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="INACTIVE">{t("status.INACTIVE")}</option>
            <option value="">{t("common.all")}</option>
          </Select>
          <Button type="submit" className="h-10 bg-teal-600 hover:bg-teal-700 text-white px-5 text-sm transition-colors">{t("common.search")}</Button>
        </form>
      </div>
      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) form.reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? t("categories.updateTitle") : t("categories.createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto px-1 py-1">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("categories.name")}</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name ? <p className="text-sm text-destructive">{form.formState.errors.name.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("categories.descriptionField")}</Label>
                <Textarea {...form.register("description")} />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>{editingItem ? t("common.saveChanges") : t("common.createNew")}</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
      {isLoading ? <LoadingState /> : null}
      {!isLoading && items.length === 0 ? <EmptyState /> : null}
      {!isLoading && items.length > 0 ? <DataTable><thead><tr><Th className="w-[90px] whitespace-nowrap">{t("common.no")}</Th><Th>{t("common.name")}</Th><Th>{t("categories.descriptionField")}</Th><Th>{t("common.status")}</Th><Th>{t("common.updatedAt")}</Th><Th className="text-right">{t("common.actions")}</Th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><Td className="font-medium">{(page - 1) * PAGE_SIZE + index + 1}</Td><Td className="font-medium">{item.name}</Td><Td>{item.description || "-"}</Td><Td><StatusBadge status={item.status} /></Td><Td>{formatDateTime(item.updatedAt)}</Td><Td className="text-right"><ActionMenu label={t("common.actions")} items={[{ label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(item) }, item.status === "ACTIVE" ? { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item), variant: "destructive" } : { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item) }]} /></Td></tr>)}</tbody></DataTable> : null}
      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
}



