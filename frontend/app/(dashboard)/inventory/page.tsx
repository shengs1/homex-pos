"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownCircle, ArrowUpCircle, CircleDollarSign, Download, PackagePlus, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime, formatMoneyInputValue, formatNumber, parseMoneyInput } from "@/lib/format";
import { inventoryService, productService, purchaseOrderService, supplierService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Product, StockTransaction, Supplier } from "@/types/domain";

type ImportInput = { productId: number; quantity: number; note?: string };
type ImportValues = ImportInput;
type AdjustInput = { productId: number; newQuantity: number; note?: string };
type AdjustValues = AdjustInput;

type DraftItem = {
  productId: number;
  productSearch: string;
  quantity: number;
  unitCost: number;
};

const emptyDraftItem: DraftItem = { productId: 0, productSearch: "", quantity: 1, unitCost: 0 };

export default function InventoryPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [isQuickImportDialogOpen, setIsQuickImportDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ ...emptyDraftItem }]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const totalDraftAmount = useMemo(() => draftItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), [draftItems]);
  const importSchema = useMemo(() => z.object({ productId: z.coerce.number().int().positive(t("inventory.productRequired")), quantity: z.coerce.number().int().positive(t("inventory.quantityPositive")), note: z.string().trim().optional() }), [t]);
  const adjustSchema = useMemo(() => z.object({ productId: z.coerce.number().int().positive(t("inventory.productRequired")), newQuantity: z.coerce.number().int().min(0, t("inventory.newQuantityMin")), note: z.string().trim().optional() }), [t]);

  const importForm = useForm<ImportInput, unknown, ImportValues>({
    resolver: zodResolver(importSchema) as any,
    defaultValues: { productId: 0, quantity: 1, note: "" },
  });

  const adjustForm = useForm<AdjustInput, unknown, AdjustValues>({
    resolver: zodResolver(adjustSchema) as any,
    defaultValues: { productId: 0, newQuantity: 0, note: "" },
  });

  async function loadOptions() {
    const [productData, supplierData] = await Promise.all([
      productService.list({ page: 1, limit: 500, status: "ACTIVE" }),
      supplierService.list({ page: 1, limit: 500, status: "ACTIVE" }),
    ]);
    setProducts(productData.items);
    setSuppliers(supplierData.items);
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

  function resetPurchaseForm() {
    setSupplierId("");
    setNote("");
    setDraftItems([{ ...emptyDraftItem }]);
  }

  function getFilteredProducts(query: string) {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products.slice(0, 80);

    return products
      .filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(keyword))
      .slice(0, 80);
  }

  function getProductOptionLabel(product: Product) {
    return `${product.sku} - ${product.name}`;
  }

  function handleProductSearchChange(index: number, value: string) {
    const matchedProduct = products.find((product) => getProductOptionLabel(product) === value || product.sku === value);
    updateDraftItem(index, {
      productSearch: value,
      productId: matchedProduct?.id || 0,
    });
  }

  function updateDraftItem(index: number, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addDraftItem() {
    setDraftItems((current) => [...current, { ...emptyDraftItem }]);
  }

  function removeDraftItem(index: number) {
    setDraftItems((current) => {
      if (current.length === 1) return [{ ...emptyDraftItem }];
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function submitPurchaseOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmittingPurchase(true);
      setErrorMessage("");
      await purchaseOrderService.create({ supplierId: Number(supplierId), note, items: draftItems });
      resetPurchaseForm();
      setIsPurchaseDialogOpen(false);
      setPage(1);
      await loadAll(1);
      toast.success(t("purchaseOrders.created"));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmittingPurchase(false);
    }
  }

  async function submitImport(values: ImportValues) {
    try {
      setErrorMessage("");
      await inventoryService.importStock(values);
      importForm.reset({ productId: 0, quantity: 1, note: "" });
      setIsQuickImportDialogOpen(false);
      await loadAll(page);
      toast.success(t("inventory.importSuccess"));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function submitAdjust(values: AdjustValues) {
    try {
      setErrorMessage("");
      await inventoryService.adjustStock(values);
      adjustForm.reset({ productId: 0, newQuantity: 0, note: "" });
      setIsAdjustDialogOpen(false);
      await loadAll(page);
      toast.success(t("inventory.adjustSuccess"));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadAll(1);
  }

  async function exportInventoryCsv() {
    const data = await inventoryService.transactions({ page: 1, limit: 1000, search, type });
    const rows = [
      ["id", "product", "type", "quantity", "operator", "order", "note", "createdAt"],
      ...data.items.map((item) => [
        String(item.id),
        item.product?.name || String(item.productId),
        item.type,
        String(item.quantity),
        item.user?.fullName || String(item.userId),
        item.order?.orderCode || "",
        item.note || "",
        formatDateTime(item.createdAt),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function getTransactionIcon(transactionType: string) {
    if (transactionType === "IMPORT") return <ArrowUpCircle className="h-4 w-4 text-emerald-600" />;
    if (transactionType === "SALE") return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
    if (transactionType === "RESTORE") return <RotateCcw className="h-4 w-4 text-emerald-600" />;
    return <SlidersHorizontal className="h-4 w-4 text-amber-600" />;
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-4 p-4">
        <PageHeader title={t("inventory.title")} description={t("inventory.description")} />
        <ErrorState message={errorMessage} />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant={activeTab === "overview" ? "default" : "outline"} onClick={() => setActiveTab("overview")}>{t("inventory.overview")}</Button>
          <Button variant="outline" onClick={() => setIsPurchaseDialogOpen(true)}>{t("inventory.purchaseStock")}</Button>
          <Button variant="outline" onClick={() => setIsQuickImportDialogOpen(true)}>{t("inventory.quickImport")}</Button>
          <Button variant="outline" onClick={() => setIsAdjustDialogOpen(true)}>{t("inventory.adjustStock")}</Button>
          <Button variant={activeTab === "history" ? "default" : "outline"} onClick={() => setActiveTab("history")}>{t("inventory.history")}</Button>
        </div>

        {activeTab === "overview" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase">{t("inventory.totalProducts")}</p>
                  <p className="text-2xl font-black text-slate-900">{formatNumber(products.length)}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.inventoryTotalProductsDesc")}</p>
                </div>
                <PackagePlus className="h-8 w-8 text-slate-300" />
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase">{t("inventory.lowStock")}</p>
                  <p className="text-2xl font-black text-amber-600">{formatNumber(lowStockItems.length)}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.lowStockDesc")}</p>
                </div>
                <ArrowDownCircle className="h-8 w-8 text-amber-500/50" />
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase">{t("inventory.transactions")}</p>
                  <p className="text-2xl font-black text-blue-600">{formatNumber(pagination?.totalItems || 0)}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.inventoryTransactionsDesc")}</p>
                </div>
                <SlidersHorizontal className="h-8 w-8 text-blue-500/50" />
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase">{t("inventory.totalValue")}</p>
                  <p className="text-xl font-black text-emerald-600 truncate">{formatCurrency(products.reduce((acc, p) => acc + Number(p.stockQuantity) * Number(p.costPrice || 0), 0))}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.inventoryValueDesc")}</p>
                </div>
                <CircleDollarSign className="h-8 w-8 text-emerald-500/50" />
              </div>
            </div>

            <Card className="min-w-0">
              <CardHeader><CardTitle>{t("inventory.lowStockTitle")}</CardTitle></CardHeader>
              <CardContent>
                {lowStockItems.length === 0 ? <EmptyState message={t("message.noLowStock")} /> : (
                  <DataTable>
                    <colgroup><col className="w-[16%]" /><col className="w-[34%]" /><col className="w-[20%]" /><col className="w-[18%]" /><col className="w-[6%]" /><col className="w-[6%]" /></colgroup>
                    <thead><tr><Th>{t("products.sku")}</Th><Th>{t("products.product")}</Th><Th>{t("products.category")}</Th><Th>{t("products.supplier")}</Th><Th>{t("products.stock")}</Th><Th>{t("inventory.minStock")}</Th></tr></thead>
                    <tbody>{lowStockItems.map((item) => <tr key={item.id}><Td><div className="break-words whitespace-normal line-clamp-2">{item.sku}</div></Td><Td><div className="break-words font-medium">{item.name}</div></Td><Td>{item.category?.name || item.categoryId}</Td><Td>{item.supplier?.name || item.supplierId}</Td><Td className="font-bold text-destructive">{item.stockQuantity}</Td><Td>{item.minStock}</Td></tr>)}</tbody>
                  </DataTable>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeTab === "history" ? (
          <div className="space-y-4">
            <Card className="min-w-0">
              <CardContent className="pt-6">
                <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_200px_auto_auto]">
                  <Input placeholder={t("inventory.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
                  <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
                    <option value="">{t("common.allTypes")}</option>
                    <option value="IMPORT">{t("status.IMPORT")}</option>
                    <option value="SALE">{t("status.SALE")}</option>
                    <option value="ADJUSTMENT">{t("status.ADJUSTMENT")}</option>
                    <option value="RESTORE">{t("status.RESTORE")}</option>
                  </Select>
                  <Button type="submit">{t("inventory.filterTransactions")}</Button>
                  <Button type="button" variant="outline" onClick={exportInventoryCsv}>
                    <Download className="h-4 w-4" />
                    {t("common.export")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {isLoading ? <LoadingState /> : null}
            {!isLoading && transactions.length === 0 ? <EmptyState message={t("message.noInventoryTransactions")} /> : null}
            {!isLoading && transactions.length > 0 ? (
              <DataTable>
                <thead><tr><Th>{t("common.id")}</Th><Th>{t("inventory.product")}</Th><Th>{t("inventory.type")}</Th><Th>{t("inventory.quantity")}</Th><Th>{t("inventory.operator")}</Th><Th>{t("common.order")}</Th><Th>{t("inventory.note")}</Th><Th>{t("common.createdAt")}</Th></tr></thead>
                <tbody>{transactions.map((item) => <tr key={item.id}><Td>{item.id}</Td><Td>{item.product?.name || item.productId}</Td><Td><div className="flex items-center gap-2">{getTransactionIcon(item.type)} <StatusBadge status={item.type} /></div></Td><Td className="font-semibold">{item.quantity > 0 ? `+${item.quantity}` : item.quantity}</Td><Td>{item.user?.fullName || item.userId}</Td><Td>{item.order?.orderCode || "-"}</Td><Td>{item.note || "-"}</Td><Td>{formatDateTime(item.createdAt)}</Td></tr>)}</tbody>
              </DataTable>
            ) : null}
            <PaginationControls pagination={pagination} onPageChange={setPage} />
          </div>
        ) : null}

        <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("inventory.purchaseStock")}</DialogTitle>
              <DialogDescription>{t("inventory.purchaseStockDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitPurchaseOrder} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("common.chooseSupplier")}</Label>
                  <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
                    <option value="">{t("common.chooseSupplier")}</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("common.note")}</Label>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("inventory.purchaseNotePlaceholder")} />
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[minmax(320px,1fr)_120px_160px_160px_64px] gap-3 bg-slate-50 px-4 py-3 text-xs font-medium uppercase text-slate-500">
                      <span>{t("products.product")}</span>
                      <span>{t("reports.quantity")}</span>
                      <span>{t("products.costPrice")}</span>
                      <span className="text-right">{t("orders.total")}</span>
                      <span className="text-center">{t("common.delete")}</span>
                    </div>
                    <div className="divide-y divide-slate-100 bg-white">
                      {draftItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-[minmax(320px,1fr)_120px_160px_160px_64px] items-center gap-3 px-4 py-3">
                          <div className="space-y-2">
                            <Input
                              list={`purchase-product-options-${index}`}
                              value={item.productSearch}
                              onChange={(event) => handleProductSearchChange(index, event.target.value)}
                              placeholder={t("inventory.productSearchPlaceholder")}
                              required={!item.productId}
                            />
                            <datalist id={`purchase-product-options-${index}`}>
                              {getFilteredProducts(item.productSearch).map((product) => (
                                <option key={product.id} value={getProductOptionLabel(product)} />
                              ))}
                            </datalist>
                            {item.productId ? (
                              <p className="text-xs font-medium text-emerald-700">{t("inventory.selectedProductSku", { sku: products.find((product) => product.id === item.productId)?.sku || "-" })}</p>
                            ) : (
                              <p className="text-xs text-slate-500">{t("inventory.chooseSuggestionHint")}</p>
                            )}
                          </div>
                          <Input type="number" min={1} value={item.quantity} onChange={(event) => updateDraftItem(index, { quantity: Number(event.target.value || 1) })} />
                          <Input inputMode="numeric" value={formatMoneyInputValue(item.unitCost)} onChange={(event) => updateDraftItem(index, { unitCost: parseMoneyInput(event.target.value) })} />
                          <div className="text-right font-semibold text-slate-700">{formatCurrency(item.quantity * item.unitCost)}</div>
                          <Button type="button" variant="outline" size="icon" className="mx-auto text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeDraftItem(index)} title={t("inventory.deleteLine")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={addDraftItem}>
                  <Plus className="h-4 w-4" />
                  {t("purchaseOrders.addItem")}
                </Button>
                <div className="text-right text-sm text-slate-500">
                  {t("orders.total")}: <span className="text-lg font-bold text-emerald-700">{formatCurrency(totalDraftAmount)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsPurchaseDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={isSubmittingPurchase}>{t("common.save")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isQuickImportDialogOpen} onOpenChange={setIsQuickImportDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("inventory.quickImport")}</DialogTitle>
              <DialogDescription>{t("inventory.quickImportDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={importForm.handleSubmit(submitImport)} className="space-y-4">
              <div className="space-y-2"><Label>{t("inventory.product")}</Label><Select value={String(importForm.watch("productId") || "")} onChange={(event) => importForm.setValue("productId", Number(event.target.value || 0), { shouldValidate: true })}><option value="">{t("inventory.selectProduct")}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</Select>{importForm.formState.errors.productId ? <p className="text-sm text-destructive">{importForm.formState.errors.productId.message}</p> : null}</div>
              <div className="space-y-2"><Label>{t("inventory.importQuantity")}</Label><Input type="number" {...importForm.register("quantity")} />{importForm.formState.errors.quantity ? <p className="text-sm text-destructive">{importForm.formState.errors.quantity.message}</p> : null}</div>
              <div className="space-y-2"><Label>{t("inventory.note")}</Label><Textarea {...importForm.register("note")} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsQuickImportDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={importForm.formState.isSubmitting}>{t("inventory.purchaseStock")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("inventory.adjustStock")}</DialogTitle>
              <DialogDescription>{t("inventory.adjustStockDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={adjustForm.handleSubmit(submitAdjust)} className="space-y-4">
              <div className="space-y-2"><Label>{t("inventory.product")}</Label><Select value={String(adjustForm.watch("productId") || "")} onChange={(event) => adjustForm.setValue("productId", Number(event.target.value || 0), { shouldValidate: true })}><option value="">{t("inventory.selectProduct")}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</Select>{adjustForm.formState.errors.productId ? <p className="text-sm text-destructive">{adjustForm.formState.errors.productId.message}</p> : null}</div>
              <div className="space-y-2"><Label>{t("inventory.newQuantity")}</Label><Input type="number" {...adjustForm.register("newQuantity")} />{adjustForm.formState.errors.newQuantity ? <p className="text-sm text-destructive">{adjustForm.formState.errors.newQuantity.message}</p> : null}</div>
              <div className="space-y-2"><Label>{t("inventory.note")}</Label><Textarea {...adjustForm.register("note")} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAdjustDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={adjustForm.formState.isSubmitting}>{t("common.adjust")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}