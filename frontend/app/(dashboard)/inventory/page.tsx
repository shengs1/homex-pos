"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackagePlus, SlidersHorizontal } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ProductCombobox } from "@/components/shared/product-combobox";
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
import { inventoryService, productService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Product, StockTransaction } from "@/types/domain";

const importSchema = z.object({ productId: z.coerce.number().int().positive("Chọn sản phẩm"), quantity: z.coerce.number().int().positive("Số lượng phải lớn hơn 0"), note: z.string().trim().optional() });
const adjustSchema = z.object({ productId: z.coerce.number().int().positive("Chọn sản phẩm"), newQuantity: z.coerce.number().int().min(0, "Tồn mới không được âm"), note: z.string().trim().optional() });

type ImportValues = z.infer<typeof importSchema>;
type AdjustValues = z.infer<typeof adjustSchema>;

export default function InventoryPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const importForm = useForm<ImportValues>({ resolver: zodResolver(importSchema), defaultValues: { productId: 0, quantity: 1, note: "" } });
  const adjustForm = useForm<AdjustValues>({ resolver: zodResolver(adjustSchema), defaultValues: { productId: 0, newQuantity: 0, note: "" } });

  async function loadOptions() {
    const data = await productService.list({ page: 1, limit: 300, status: "ACTIVE" });
    setProducts(data.items);
  }

  async function loadLowStock() {
    const data = await inventoryService.lowStock({ page: 1, limit: 10, search });
    setLowStockItems(data.items);
  }

  async function loadTransactions(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await inventoryService.transactions({ page: currentPage, limit: 10, search, type });
      setTransactions(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAll(currentPage = page) {
    try {
      setErrorMessage("");
      await Promise.all([loadOptions(), loadLowStock(), loadTransactions(currentPage)]);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    loadAll(page);
  }, [page, type]);

  async function submitImport(values: ImportValues) {
    try {
      setSuccessMessage("");
      setErrorMessage("");
      await inventoryService.importStock(values);
      setSuccessMessage(t("inventory.importSuccess"));
      importForm.reset({ productId: 0, quantity: 1, note: "" });
      await loadAll(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function submitAdjust(values: AdjustValues) {
    try {
      setSuccessMessage("");
      setErrorMessage("");
      await inventoryService.adjustStock(values);
      setSuccessMessage(t("inventory.adjustSuccess"));
      adjustForm.reset({ productId: 0, newQuantity: 0, note: "" });
      await loadAll(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadAll(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("inventory.title")} description={t("inventory.description")} />
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" />{t("inventory.importStock")}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={importForm.handleSubmit(submitImport)} className="space-y-3">
                <div className="space-y-2"><Label>{t("inventory.product")}</Label><ProductCombobox products={products} value={importForm.watch("productId")} onChange={(value) => importForm.setValue("productId", value, { shouldValidate: true })} />{importForm.formState.errors.productId ? <p className="text-sm text-destructive">{importForm.formState.errors.productId.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("inventory.importQuantity")}</Label><Input type="number" {...importForm.register("quantity")} />{importForm.formState.errors.quantity ? <p className="text-sm text-destructive">{importForm.formState.errors.quantity.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("inventory.note")}</Label><Textarea {...importForm.register("note")} /></div>
                <Button type="submit" disabled={importForm.formState.isSubmitting}>{t("inventory.importStock")}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" />{t("inventory.adjustStock")}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={adjustForm.handleSubmit(submitAdjust)} className="space-y-3">
                <div className="space-y-2"><Label>{t("inventory.product")}</Label><ProductCombobox products={products} value={adjustForm.watch("productId")} onChange={(value) => adjustForm.setValue("productId", value, { shouldValidate: true })} />{adjustForm.formState.errors.productId ? <p className="text-sm text-destructive">{adjustForm.formState.errors.productId.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("inventory.newQuantity")}</Label><Input type="number" {...adjustForm.register("newQuantity")} />{adjustForm.formState.errors.newQuantity ? <p className="text-sm text-destructive">{adjustForm.formState.errors.newQuantity.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("inventory.note")}</Label><Textarea {...adjustForm.register("note")} /></div>
                <Button type="submit" disabled={adjustForm.formState.isSubmitting}>{t("common.adjust")}</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{t("inventory.lowStockTitle")}</CardTitle></CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? <EmptyState message={t("message.noLowStock")} /> : (
              <DataTable noHorizontalScroll>
                <colgroup><col className="w-[16%]" /><col className="w-[34%]" /><col className="w-[20%]" /><col className="w-[18%]" /><col className="w-[6%]" /><col className="w-[6%]" /></colgroup>
                <thead><tr><Th>{t("products.sku")}</Th><Th>{t("products.product")}</Th><Th>{t("products.category")}</Th><Th>{t("products.supplier")}</Th><Th>{t("products.stock")}</Th><Th>{t("inventory.minStock")}</Th></tr></thead>
                <tbody>{lowStockItems.map((item) => <tr key={item.id}><Td><div className="truncate">{item.sku}</div></Td><Td><div className="break-words font-medium">{item.name}</div></Td><Td>{item.category?.name || item.categoryId}</Td><Td>{item.supplier?.name || item.supplierId}</Td><Td className="font-bold text-destructive">{item.stockQuantity}</Td><Td>{item.minStock}</Td></tr>)}</tbody>
              </DataTable>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
              <Input placeholder={t("inventory.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
                <option value="">{t("common.allTypes")}</option>
                <option value="IMPORT">{t("status.IMPORT")}</option>
                <option value="SALE">{t("status.SALE")}</option>
                <option value="ADJUSTMENT">{t("status.ADJUSTMENT")}</option>
                <option value="RESTORE">{t("status.RESTORE")}</option>
              </Select>
              <Button type="submit">{t("inventory.filterTransactions")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && transactions.length === 0 ? <EmptyState message={t("message.noInventoryTransactions")} /> : null}
        {!isLoading && transactions.length > 0 ? (
          <DataTable>
            <thead><tr><Th>{t("common.id")}</Th><Th>{t("inventory.product")}</Th><Th>{t("inventory.type")}</Th><Th>{t("inventory.quantity")}</Th><Th>{t("inventory.operator")}</Th><Th>{t("common.order")}</Th><Th>{t("inventory.note")}</Th><Th>{t("common.createdAt")}</Th></tr></thead>
            <tbody>{transactions.map((item) => <tr key={item.id}><Td>{item.id}</Td><Td>{item.product?.name || item.productId}</Td><Td><StatusBadge status={item.type} /></Td><Td>{item.quantity}</Td><Td>{item.user?.fullName || item.userId}</Td><Td>{item.order?.orderCode || "-"}</Td><Td>{item.note || "-"}</Td><Td>{formatDateTime(item.createdAt)}</Td></tr>)}</tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}
