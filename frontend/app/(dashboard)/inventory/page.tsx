"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownCircle, ArrowUpCircle, CircleDollarSign, Download, PackagePlus, Plus, RotateCcw, SlidersHorizontal, Trash2, Sparkles, Bot, Loader2, ChevronDown, ChevronUp, Check, X, EyeOff, Hourglass } from "lucide-react";
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

  // AI Drawer states
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [forecastDays, setForecastDays] = useState(15);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0); // 0, 1, 2, 3
  const [aiData, setAiData] = useState<any>(null);
  const [expandedItemSku, setExpandedItemSku] = useState<string | null>(null);
  const [approvedItems, setApprovedItems] = useState<any[]>([]);
  const [declinedSkus, setDeclinedSkus] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "urgent" | "trends">("all");

  useEffect(() => {
    if (!isAnalyzing) return;
    setLoadingStep(1);
    
    const timer1 = setTimeout(() => {
      setLoadingStep(2);
    }, 1200);

    const timer2 = setTimeout(() => {
      setLoadingStep(3);
    }, 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isAnalyzing]);

  async function runAiAnalysis() {
    try {
      setIsAnalyzing(true);
      setAiData(null);
      setExpandedItemSku(null);
      setApprovedItems([]);
      setDeclinedSkus([]);
      setActiveFilter("all");
      
      const res = await inventoryService.aiForecast({ days: forecastDays });
      setAiData(res);
    } catch (error) {
      toast.error("Không thể phân tích dữ liệu kho: " + getApiErrorMessage(error));
    } finally {
      setIsAnalyzing(false);
      setLoadingStep(0);
    }
  }

  function handleApproveItem(item: any) {
    if (item.suggestedRestockQuantity <= 0) return;
    if (approvedItems.some(i => i.sku === item.sku)) return;
    setApprovedItems(prev => [...prev, item]);
  }

  function handleDeclineItem(item: any) {
    setDeclinedSkus(prev => [...prev, item.sku]);
    setApprovedItems(prev => prev.filter(i => i.sku !== item.sku));
  }

  const visibleRestockList = useMemo(() => {
    if (!aiData?.restockList) return [];
    const nonDeclined = aiData.restockList.filter((item: any) => !declinedSkus.includes(item.sku));
    if (activeFilter === "urgent") {
      return nonDeclined.filter((item: any) => 
        item.suggestedRestockQuantity > 0 || item.recommendationType === "LOW_STOCK"
      );
    }
    if (activeFilter === "trends") {
      return nonDeclined.filter((item: any) => 
        item.recommendationType === "RISING_TREND" || item.recommendationType === "SEASONAL_HOT"
      );
    }
    return nonDeclined;
  }, [aiData, declinedSkus, activeFilter]);

  function handleCreatePurchaseFromApproved() {
    if (approvedItems.length === 0) return;

    const mappedItems = approvedItems.map(item => {
      const matchedProd = products.find(p => p.sku === item.sku);
      return {
        productId: matchedProd?.id || item.productId || 0,
        productSearch: matchedProd ? `${matchedProd.sku} - ${matchedProd.name}` : `${item.sku} - ${item.name}`,
        quantity: item.suggestedRestockQuantity,
        unitCost: matchedProd ? Number(matchedProd.costPrice) : 0,
      };
    });

    setDraftItems(mappedItems);
    setIsPurchaseDialogOpen(true);
    setIsAiDrawerOpen(false);
    toast.success(`Đã chuyển ${approvedItems.length} đề xuất nhập kho sang phiếu nhập hàng!`);
  }

  function handleResetAiDrawer() {
    setForecastDays(15);
    setAiData(null);
    setExpandedItemSku(null);
    setApprovedItems([]);
    setDeclinedSkus([]);
    setActiveFilter("all");
  }

  function formatPercent(multiplier: number): string {
    const pct = Math.round((multiplier - 1) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={activeTab === "overview" ? "default" : "outline"} onClick={() => setActiveTab("overview")}>{t("inventory.overview")}</Button>
            <Button variant="outline" onClick={() => setIsPurchaseDialogOpen(true)}>{t("inventory.purchaseStock")}</Button>
            <Button variant="outline" onClick={() => setIsQuickImportDialogOpen(true)}>{t("inventory.quickImport")}</Button>
            <Button variant="outline" onClick={() => setIsAdjustDialogOpen(true)}>{t("inventory.adjustStock")}</Button>
            <Button variant={activeTab === "history" ? "default" : "outline"} onClick={() => setActiveTab("history")}>{t("inventory.history")}</Button>
          </div>

          <Button
            onClick={() => setIsAiDrawerOpen(true)}
            className="bg-gradient-to-r from-teal-600 to-emerald-500 text-white hover:from-teal-700 hover:to-emerald-600 shadow-sm border border-teal-500/30 transition-all font-medium flex items-center gap-2 px-4 py-2 rounded-xl transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4 animate-pulse text-yellow-300" />
            Trợ lý AI Kho
          </Button>
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

        {/* AI Inventory Assistant Drawer */}
        {isAiDrawerOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
              onClick={() => setIsAiDrawerOpen(false)}
            />
            
            {/* Drawer Panel */}
            <div className="relative w-full max-w-3xl bg-slate-50 shadow-2xl flex flex-col h-full border-l border-slate-200 z-10 animate-in slide-in-from-right duration-300">
              
              {/* Header */}
              <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Bot className="h-5 w-5 text-teal-600 animate-bounce" />
                    Trợ lý AI Phân tích Kho
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">
                    Dữ liệu bán hàng 30 ngày & dự phòng {forecastDays} ngày tới
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="rounded-full h-8 w-8 hover:bg-slate-100 border-slate-200" 
                    onClick={handleResetAiDrawer}
                    title="Đặt lại phân tích"
                  >
                    <RotateCcw className="h-4 w-4 text-slate-500" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="rounded-full h-8 w-8 hover:bg-slate-100 border-slate-200" 
                    onClick={() => setIsAiDrawerOpen(false)}
                  >
                    <X className="h-4 w-4 text-slate-500" />
                  </Button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Control Panel */}
                <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-4">
                  <div className="flex items-end gap-4">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs font-bold text-slate-700 uppercase">Số ngày dự phòng hàng</Label>
                      <Input 
                        type="number" 
                        min={1} 
                        max={90} 
                        value={forecastDays} 
                        onChange={(e) => setForecastDays(Math.max(1, Number(e.target.value)))}
                        className="bg-slate-50 border-slate-200 focus:bg-white"
                        disabled={isAnalyzing}
                      />
                    </div>
                    <Button 
                      onClick={runAiAnalysis}
                      disabled={isAnalyzing}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-2 px-6 h-10 shadow-sm transition-all duration-200"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      AI Phân tích mới
                    </Button>
                  </div>
                </div>

                {/* Loading State */}
                {isAnalyzing && (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center space-y-6">
                    <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                    <div className="w-full max-w-sm space-y-3">
                      <div className="flex items-center gap-3 text-sm font-medium">
                        {loadingStep >= 1 ? (
                          <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0"><Check className="h-3 w-3 stroke-[3]" /></div>
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-teal-600 border-t-transparent animate-spin shrink-0" />
                        )}
                        <span className={loadingStep >= 1 ? "text-slate-500 line-through" : "text-teal-600 font-bold"}>
                          Đang tổng hợp lịch sử bán hàng...
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm font-medium">
                        {loadingStep >= 2 ? (
                          <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0"><Check className="h-3 w-3 stroke-[3]" /></div>
                        ) : loadingStep === 1 ? (
                          <div className="h-5 w-5 rounded-full border-2 border-teal-600 border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-slate-200 shrink-0" />
                        )}
                        <span className={loadingStep >= 2 ? "text-slate-500 line-through" : loadingStep === 1 ? "text-teal-600 font-bold" : "text-slate-400"}>
                          Đang kiểm tra tồn kho hiện tại...
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm font-medium">
                        {loadingStep >= 3 ? (
                          <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0"><Check className="h-3 w-3 stroke-[3]" /></div>
                        ) : loadingStep === 2 ? (
                          <div className="h-5 w-5 rounded-full border-2 border-teal-600 border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-slate-200 shrink-0" />
                        )}
                        <span className={loadingStep >= 3 ? "text-teal-600 font-bold" : "text-slate-400"}>
                          AI đang phân tích xu hướng nhập hàng...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dashboard / Report results */}
                {aiData && !isAnalyzing && (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-red-500 uppercase">Sắp hết</p>
                        <p className="text-2xl font-black text-red-700 mt-1">{aiData.stats.outOfStock}</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-amber-500 uppercase">Tồn thấp</p>
                        <p className="text-2xl font-black text-amber-700 mt-1">{aiData.stats.lowStock}</p>
                      </div>
                      <div className="bg-teal-50 rounded-xl border border-teal-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-teal-500 uppercase">Đề xuất nhập</p>
                        <p className="text-2xl font-black text-teal-700 mt-1">{aiData.stats.recommended}</p>
                      </div>
                      <div className="bg-orange-50 rounded-xl border border-orange-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-orange-500 uppercase">Xu hướng tăng</p>
                        <p className="text-2xl font-black text-orange-700 mt-1">{aiData.stats.risingTrend || 0}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase">Hot mùa vụ</p>
                        <p className="text-2xl font-black text-emerald-700 mt-1">{aiData.stats.seasonalHot || 0}</p>
                      </div>
                      <div className="bg-slate-100 rounded-xl border border-slate-200 p-3 text-center shadow-sm">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Đủ hàng</p>
                        <p className="text-2xl font-black text-slate-700 mt-1">{aiData.stats.safe}</p>
                      </div>
                    </div>

                    {/* Overview Analysis */}
                    <div className="bg-teal-50 rounded-2xl border border-teal-100 p-4 shadow-sm space-y-2">
                      <h4 className="text-xs font-bold text-teal-800 uppercase flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-teal-600" />
                        Nhận định tổng quan từ AI
                      </h4>
                      <p className="text-sm text-slate-600 leading-relaxed font-medium">
                        {aiData.overview}
                      </p>
                    </div>

                    {/* Restock Recommendations List */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Danh sách Đề xuất Nhập kho</h4>
                        <span className="text-xs font-semibold text-slate-400">Hiển thị {visibleRestockList.length} đề xuất</span>
                      </div>

                      {/* Tab Filters */}
                      <div className="flex border-b border-slate-200 bg-white rounded-lg p-0.5 border shadow-sm">
                        <button
                          type="button"
                          onClick={() => setActiveFilter("all")}
                          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${activeFilter === "all" ? "bg-teal-50 text-teal-700 border border-teal-100/50" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          Tất cả ({aiData.restockList.filter((item: any) => !declinedSkus.includes(item.sku)).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveFilter("urgent")}
                          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${activeFilter === "urgent" ? "bg-red-50 text-red-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          Cần nhập gấp ({aiData.restockList.filter((item: any) => !declinedSkus.includes(item.sku) && (item.suggestedRestockQuantity > 0 || item.recommendationType === "LOW_STOCK")).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveFilter("trends")}
                          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition-all ${activeFilter === "trends" ? "bg-orange-50 text-orange-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          Xu hướng sắp hot ({aiData.restockList.filter((item: any) => !declinedSkus.includes(item.sku) && (item.recommendationType === "RISING_TREND" || item.recommendationType === "SEASONAL_HOT")).length})
                        </button>
                      </div>
                      
                      {visibleRestockList.length === 0 ? (
                        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 font-medium">
                          Không có đề xuất nào trong danh mục này. Kho hàng hiện tại an toàn!
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {visibleRestockList.map((item: any) => {
                            const isApproved = approvedItems.some(i => i.sku === item.sku);
                            const isExpanded = expandedItemSku === item.sku;
                            
                            let priorityColor = "bg-slate-100 text-slate-700 border-slate-200";
                            if (item.priority === "HIGH") priorityColor = "bg-red-50 text-red-700 border-red-100";
                            else if (item.priority === "MEDIUM") priorityColor = "bg-amber-50 text-amber-700 border-amber-100";

                            const rawAvgDailySales = Number(item.avgDailySales ?? 0);
                            const avgDailySales = rawAvgDailySales > 0 
                              ? rawAvgDailySales 
                              : (item.soldLast30Days > 0 ? item.soldLast30Days / 30 : 0);
                            const predictedDailySales = Number(item.predictedDailySales ?? 0);
                            const dailySales = predictedDailySales > 0 ? predictedDailySales : avgDailySales;
                            const expectedSales = Math.ceil(dailySales * forecastDays);

                            let stockCoverageLabel = "";
                            if (item.currentStock <= 0) {
                              stockCoverageLabel = "0 ngày";
                            } else if (dailySales <= 0) {
                              stockCoverageLabel = "Chưa xác định";
                            } else {
                              stockCoverageLabel = `~${Math.floor(item.currentStock / dailySales)} ngày`;
                            }

                            let typeBadge = null;
                            const hasSales = item.soldLast7Days > 0 || item.soldLast30Days > 0;
                            
                            if (item.seasonName) {
                              typeBadge = <span className="bg-emerald-50 text-emerald-700 border-emerald-200 px-1.5 py-0.5 text-[8px] font-bold rounded border uppercase">Sắp hot theo mùa</span>;
                            } else {
                              if (!hasSales) {
                                typeBadge = <span className="bg-slate-100 text-slate-500 border-slate-200 px-1.5 py-0.5 text-[8px] font-bold rounded border uppercase">Chưa đủ dữ liệu</span>;
                              } else {
                                if (item.recommendationType === "LOW_STOCK") {
                                  typeBadge = <span className="bg-red-50 text-red-700 border-red-200 px-1.5 py-0.5 text-[8px] font-bold rounded border uppercase">Tồn thấp</span>;
                                } else if (item.recommendationType === "CATEGORY_MOMENTUM") {
                                  typeBadge = <span className="bg-blue-50 text-blue-700 border-blue-200 px-1.5 py-0.5 text-[8px] font-bold rounded border uppercase">Danh mục tăng</span>;
                                } else {
                                  typeBadge = <span className="bg-orange-50 text-orange-700 border-orange-200 px-1.5 py-0.5 text-[8px] font-bold rounded border uppercase">Xu hướng tăng</span>;
                                }
                              }
                            }

                            return (
                              <div key={item.sku} className={`bg-white rounded-xl border transition-all duration-200 shadow-sm overflow-hidden ${isApproved ? 'border-emerald-200 bg-emerald-50/5' : 'border-slate-200 hover:border-slate-300'}`}>
                                <div className="p-4 flex gap-4">
                                  {/* Product image */}
                                  <div className="h-16 w-16 rounded-lg bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                                    {item.imageUrl ? (
                                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-bold">NO IMG</span>
                                    )}
                                  </div>

                                  {/* Product detail info */}
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <h5 className="font-bold text-slate-800 text-sm truncate" title={item.name}>{item.name}</h5>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                          <span className="text-[10px] font-mono text-slate-400">SKU: {item.sku}</span>
                                          {typeBadge}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {item.suggestedRestockQuantity <= 0 ? (
                                          <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[9px] font-bold rounded-full uppercase">
                                            Chưa cần nhập
                                          </span>
                                        ) : (
                                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border uppercase ${priorityColor}`}>
                                            {item.priority}
                                          </span>
                                        )}
                                        {isApproved && (
                                          <span className="bg-emerald-100 text-emerald-800 border-emerald-200 px-2 py-0.5 text-[9px] font-bold rounded-full border flex items-center gap-0.5">
                                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                                            Đã duyệt
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Stats grid */}
                                    <div className="grid grid-cols-3 gap-2 pt-2 text-center border-t border-slate-100">
                                      <div className="bg-slate-50 rounded px-1 py-1">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase">Tồn / T.Thiểu</p>
                                        <p className="text-xs font-black text-slate-700 mt-0.5">{item.currentStock} / {item.minimumStock}</p>
                                      </div>
                                      <div className="bg-slate-50 rounded px-1 py-1">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase">Bán 30 ngày</p>
                                        <p className="text-xs font-black text-slate-700 mt-0.5">{item.soldLast30Days}</p>
                                      </div>
                                      <div className="bg-slate-50 rounded px-1 py-1">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase">Bán 7 ngày</p>
                                        <p className="text-xs font-black text-slate-700 mt-0.5">{item.soldLast7Days || 0}</p>
                                      </div>
                                      <div className="bg-slate-50 rounded px-1 py-1">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase">Dự kiến bán ({forecastDays} ngày)</p>
                                        <p className="text-xs font-black text-slate-700 mt-0.5">~ {expectedSales} SP</p>
                                      </div>
                                      <div className="bg-slate-50 rounded px-1 py-1">
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase flex items-center justify-center gap-0.5">
                                          <Hourglass className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                                          Đủ bán trong
                                        </p>
                                        <p className="text-xs font-black text-slate-700 mt-0.5">{stockCoverageLabel}</p>
                                      </div>
                                      <div className={`${item.suggestedRestockQuantity > 0 ? 'bg-teal-50' : 'bg-slate-50'} rounded px-1 py-1`}>
                                        <p className={`text-[8px] font-bold ${item.suggestedRestockQuantity > 0 ? 'text-teal-600' : 'text-slate-500'} uppercase`}>
                                          {item.suggestedRestockQuantity > 0 ? "Khuyên Nhập" : "Khuyến nghị"}
                                        </p>
                                        <p className={`text-xs font-black ${item.suggestedRestockQuantity > 0 ? 'text-teal-700' : 'text-slate-700'} mt-0.5`}>
                                          {item.suggestedRestockQuantity > 0 ? item.suggestedRestockQuantity : "Theo dõi"}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Reason */}
                                    <p className="text-xs text-slate-500 pt-2 flex items-start gap-1">
                                      <span className="font-bold text-slate-700 shrink-0">Lý do:</span>
                                      <span className="italic text-slate-600">{item.reason}</span>
                                    </p>

                                    {/* Action Row */}
                                    <div className="flex items-center justify-between pt-3 gap-2">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        type="button"
                                        onClick={() => setExpandedItemSku(isExpanded ? null : item.sku)}
                                        className="text-xs text-teal-600 hover:text-teal-700 p-0 h-auto flex items-center gap-0.5 hover:bg-transparent"
                                      >
                                        {isExpanded ? <ChevronUp className="h-4 w-4 text-teal-600" /> : <ChevronDown className="h-4 w-4 text-teal-600" />}
                                        {isExpanded ? "Thu gọn phân tích" : "Xem AI phân tích chi tiết"}
                                      </Button>

                                      <div className="flex items-center gap-2">
                                        {item.suggestedRestockQuantity > 0 ? (
                                          <>
                                            <Button 
                                              variant="outline" 
                                              size="sm"
                                              type="button"
                                              onClick={() => handleDeclineItem(item)}
                                              className="text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 h-8 px-2.5 rounded-lg flex items-center gap-1 transition-colors"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                              Từ chối
                                            </Button>
                                            <Button 
                                              variant="outline"
                                              size="sm"
                                              type="button"
                                              onClick={() => handleApproveItem(item)}
                                              disabled={isApproved}
                                              className={`text-xs h-8 px-2.5 rounded-lg flex items-center gap-1 transition-colors ${isApproved ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'}`}
                                            >
                                              <Check className="h-3.5 w-3.5" />
                                              Duyệt
                                            </Button>
                                          </>
                                        ) : (
                                          <Button 
                                            variant="outline" 
                                            size="sm"
                                            type="button"
                                            onClick={() => handleDeclineItem(item)}
                                            className="text-xs border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 h-8 px-2.5 rounded-lg flex items-center gap-1 transition-colors"
                                          >
                                            <EyeOff className="h-3.5 w-3.5" />
                                            Ẩn theo dõi
                                          </Button>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                </div>

                                {/* Expanded detailed analysis section */}
                                {isExpanded && (
                                  <div className="bg-slate-50/80 border-t border-slate-100 p-4 text-xs space-y-3">
                                    <div className="space-y-1">
                                      <p className="font-bold text-slate-700 uppercase text-[9px]">Quyết định nhập</p>
                                      <p className="text-slate-600 font-medium">{item.detailAnalysis.decision}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="font-bold text-slate-700 uppercase text-[9px]">Lý do chính</p>
                                      <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-medium">
                                        {item.detailAnalysis.mainReasons.map((r: string, idx: number) => (
                                          <li key={idx}>{r}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="font-bold text-slate-700 uppercase text-[9px]">Rủi ro cần kiểm soát</p>
                                      <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-medium">
                                        {item.detailAnalysis.risks.map((r: string, idx: number) => (
                                          <li key={idx}>{r}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="font-bold text-slate-700 uppercase text-[9px]">Kế hoạch hành động</p>
                                      <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-medium">
                                        {item.detailAnalysis.actionPlan.map((r: string, idx: number) => (
                                          <li key={idx}>{r}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="space-y-1 pt-2 border-t border-slate-200/60 mt-2">
                                      <p className="font-bold text-slate-700 uppercase text-[9px]">Tín hiệu dự báo</p>
                                      <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-medium">
                                        <li title={`Chỉ số chi tiết: ${formatPercent(item.trendRatio)}`}>
                                          Xu hướng gần đây: {
                                            Math.round((item.trendRatio - 1) * 100) > 0 
                                              ? "Nhu cầu đang tăng so với giai đoạn trước." 
                                              : Math.round((item.trendRatio - 1) * 100) < 0 
                                                ? "Nhu cầu đang giảm so với giai đoạn trước." 
                                                : "Chưa ghi nhận biến động rõ ràng."
                                          }
                                        </li>
                                        <li title={`Chỉ số chi tiết: ${formatPercent(item.seasonBoost)}`}>
                                          Yếu tố mùa vụ: {
                                            item.seasonName
                                              ? `Sản phẩm phù hợp với ${item.seasonName} (${item.seasonMonths}). ${item.seasonReason}`
                                              : "Chưa có mùa vụ rõ ràng cho sản phẩm này."
                                          }
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                )}
                
                {/* Empty State */}
                {!aiData && !isAnalyzing && (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-4">
                    <div className="p-4 bg-teal-50 rounded-full text-teal-600">
                      <Bot className="h-8 w-8 animate-bounce" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-800 text-sm">Chưa có kết quả phân tích</h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        Nhập số ngày dự phòng hàng hóa mong muốn ở trên và nhấn nút Phân tích mới để bắt đầu.
                      </p>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="bg-white border-t border-slate-100 p-4 flex justify-between items-center px-6">
                <div className="text-xs text-slate-500 font-medium">
                  Đã duyệt: <span className="font-bold text-emerald-700">{approvedItems.length}</span> đề xuất
                </div>
                <Button 
                  onClick={handleCreatePurchaseFromApproved}
                  disabled={approvedItems.length === 0}
                  className={`font-bold flex items-center gap-1.5 shadow-md px-6 py-2.5 rounded-xl transition-all duration-200 ${approvedItems.length === 0 ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                >
                  <Plus className="h-4 w-4" />
                  Tạo phiếu nhập từ đề xuất đã duyệt
                </Button>
              </div>

            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}