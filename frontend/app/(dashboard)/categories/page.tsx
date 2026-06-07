"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { categoryService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Category } from "@/types/domain";

const formSchema = z.object({ name: z.string().trim().min(1, "Tên không được để trống"), description: z.string().trim().optional() });
type FormValues = z.infer<typeof formSchema>;

export default function CategoriesPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", description: "" } });

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await categoryService.list({ page: currentPage, limit: 10, search, status });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadData(page); }, [page, status]);

  function openCreateForm() { setEditingItem(null); form.reset({ name: "", description: "" }); setIsFormOpen(true); }
  function openEditForm(item: Category) { setEditingItem(item); form.reset({ name: item.name, description: item.description || "" }); setIsFormOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function onSubmit(values: FormValues) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      if (editingItem) { await categoryService.update(editingItem.id, values); setSuccessMessage(t("message.updated")); }
      else { await categoryService.create(values); setSuccessMessage(t("message.created")); }
      setIsFormOpen(false);
      await loadData(page);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  async function handleDelete(item: Category) {
    if (!window.confirm(t("categories.deleteConfirm", { name: item.name }))) return;
    try { await categoryService.remove(item.id); setSuccessMessage(t("message.deleted")); await loadData(page); } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  async function handleRestore(item: Category) {
    if (!window.confirm(t("categories.restoreConfirm", { name: item.name }))) return;
    try { await categoryService.restore(item.id); setSuccessMessage(t("message.restored")); await loadData(page); } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); loadData(1); }

  return (
    <div className="space-y-6">
      <PageHeader title={t("categories.title")} description={t("categories.description")}><Button onClick={openCreateForm}><Plus className="h-4 w-4" />{t("categories.add")}</Button></PageHeader>
      <ErrorState message={errorMessage} />
      {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}
      <Card><CardContent className="pt-6"><form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_180px_auto]"><Input placeholder={t("categories.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ACTIVE">{t("status.ACTIVE")}</option><option value="INACTIVE">{t("status.INACTIVE")}</option><option value="">{t("common.all")}</option></Select><Button type="submit">{t("common.search")}</Button></form></CardContent></Card>
      {isFormOpen ? <Card><CardHeader><CardTitle>{editingItem ? t("categories.updateTitle") : t("categories.createTitle")}</CardTitle></CardHeader><CardContent><form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>{t("categories.name")}</Label><Input {...form.register("name")} />{form.formState.errors.name ? <p className="text-sm text-destructive">{form.formState.errors.name.message}</p> : null}</div><div className="space-y-2 md:col-span-2"><Label>{t("categories.descriptionField")}</Label><Textarea {...form.register("description")} /></div><div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={form.formState.isSubmitting}>{editingItem ? t("common.saveChanges") : t("common.createNew")}</Button><Button variant="outline" onClick={() => setIsFormOpen(false)}>{t("common.cancel")}</Button></div></form></CardContent></Card> : null}
      {isLoading ? <LoadingState /> : null}
      {!isLoading && items.length === 0 ? <EmptyState /> : null}
      {!isLoading && items.length > 0 ? <DataTable><thead><tr><Th>{t("common.id")}</Th><Th>{t("common.name")}</Th><Th>{t("categories.descriptionField")}</Th><Th>{t("common.status")}</Th><Th>{t("common.updatedAt")}</Th><Th className="text-right">{t("common.actions")}</Th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><Td>{item.id}</Td><Td className="font-medium">{item.name}</Td><Td>{item.description || "-"}</Td><Td><StatusBadge status={item.status} /></Td><Td>{formatDateTime(item.updatedAt)}</Td><Td className="text-right"><ActionMenu label={t("common.actions")} items={[{ label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(item) }, item.status === "ACTIVE" ? { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item), variant: "destructive" } : { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item) }]} /></Td></tr>)}</tbody></DataTable> : null}
      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
}
