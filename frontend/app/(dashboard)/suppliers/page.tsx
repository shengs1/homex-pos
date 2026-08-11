"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Plus, RotateCcw, Trash2, Search, ArrowRightLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";

import { RoleGuard } from "@/components/auth/role-guard";
import { ActionMenu } from "@/components/shared/action-menu";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ProductCombobox } from "@/components/shared/product-combobox";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { formatCurrency, formatDateTime, formatMoneyInputValue, parseMoneyInput } from "@/lib/format";
import { productService, purchaseOrderService, supplierService, inventoryService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Product, PurchaseOrder, Supplier, StockTransaction } from "@/types/domain";

const PAGE_SIZE = 10;

type FormValues = { name: string; phone: string; email?: string; address?: string };

type DraftItem = {
  productId: number;
  quantity: number;
  unitCost: number;
};

export default function SuppliersPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "list";

  // Suppliers state
  const [items, setItems] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [editingItem, setEditingItem] = useState<Supplier | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Stats
  const [allPurchaseOrders, setAllPurchaseOrders] = useState<PurchaseOrder[]>([]);

  // Purchase Orders state
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ordersPagination, setOrdersPagination] = useState<Pagination | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ productId: 0, quantity: 1, unitCost: 0 }]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);

  // History state
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [historyPagination, setHistoryPagination] = useState<Pagination | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const formSchema = useMemo(() => z.object({ name: z.string().trim().min(1, t("suppliers.nameRequired")), phone: z.string().trim().min(1, t("suppliers.phoneRequired")), email: z.string().trim().email(t("suppliers.emailInvalid")).optional().or(z.literal("")), address: z.string().trim().optional() }), [t]);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: "", phone: "", email: "", address: "" } });
  const totalDraftAmount = useMemo(() => draftItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), [draftItems]);

  // Load suppliers list
  async function loadData(currentPage = page) {
    try {
      setIsLoading(true); setErrorMessage("");
      const data = await supplierService.list({ page: currentPage, limit: PAGE_SIZE, search, status });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
    finally { setIsLoading(false); }
  }

  // Load options for Purchase Orders
  async function loadOptions() {
    try {
      const [productData, supplierData, allOrdersData] = await Promise.all([
        productService.list({ page: 1, limit: 500, status: "ACTIVE" }),
        supplierService.list({ page: 1, limit: 500, status: "ACTIVE" }),
        purchaseOrderService.list({ page: 1, limit: 1000 })
      ]);
      setProducts(productData.items);
      setAllSuppliers(supplierData.items);
      setAllPurchaseOrders(allOrdersData.items);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  // Load Purchase Orders
  async function loadOrders(currentPage = ordersPage) {
    try {
      setIsOrdersLoading(true); setErrorMessage("");
      const data = await purchaseOrderService.list({ page: currentPage, limit: PAGE_SIZE });
      setOrders(data.items);
      setOrdersPagination(data.pagination);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
    finally { setIsOrdersLoading(false); }
  }

  // Load History
  async function loadHistory(currentPage = historyPage) {
    try {
      setIsHistoryLoading(true); setErrorMessage("");
      const data = await inventoryService.transactions({ page: currentPage, limit: PAGE_SIZE, type: "IMPORT" });
      setTransactions(data.items);
      setHistoryPagination(data.pagination);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
    finally { setIsHistoryLoading(false); }
  }

  useEffect(() => { loadData(page); }, [page, status]);
  useEffect(() => { loadOptions(); }, []);
  useEffect(() => { loadOrders(ordersPage); }, [ordersPage]);
  useEffect(() => { loadHistory(historyPage); }, [historyPage]);

  function openCreateForm() { setEditingItem(null); form.reset({ name: "", phone: "", email: "", address: "" }); setIsFormOpen(true); }
  function openEditForm(item: Supplier) { setEditingItem(item); form.reset({ name: item.name, phone: item.phone || "", email: item.email || "", address: item.address || "" }); setIsFormOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function onSubmit(values: FormValues) {
    try {
      setErrorMessage(""); setSuccessMessage("");
      if (editingItem) {
        await supplierService.update(editingItem.id, values);
        setSuccessMessage(t("message.updated"));
      } else {
        await supplierService.create(values);
        setSuccessMessage(t("message.created"));
      }
      setIsFormOpen(false);
      await Promise.all([loadData(page), loadOptions()]);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  async function handleDelete(item: Supplier) { if (!(await confirmAction({ description: t("suppliers.deleteConfirm", { name: item.name }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true }))) return; try { await supplierService.remove(item.id); setSuccessMessage(t("message.deleted")); await Promise.all([loadData(page), loadOptions()]); } catch (error) { setErrorMessage(getApiErrorMessage(error)); } }
  async function handleRestore(item: Supplier) { if (!(await confirmAction({ description: t("suppliers.restoreConfirm", { name: item.name }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel") }))) return; try { await supplierService.restore(item.id); setSuccessMessage(t("message.restored")); await Promise.all([loadData(page), loadOptions()]); } catch (error) { setErrorMessage(getApiErrorMessage(error)); } }
  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); loadData(1); }

  // Draft items functions
  function updateDraftItem(index: number, patch: Partial<DraftItem>) { setDraftItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))); }
  function addDraftItem() { setDraftItems((current) => [...current, { productId: 0, quantity: 1, unitCost: 0 }]); }
  function removeDraftItem(index: number) { setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index)); }

  async function submitPurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setErrorMessage(""); setSuccessMessage("");
      await purchaseOrderService.create({ supplierId: Number(supplierId), note, items: draftItems });
      setSupplierId(""); setNote(""); setDraftItems([{ productId: 0, quantity: 1, unitCost: 0 }]);
      setSuccessMessage(t("purchaseOrders.created"));
      await Promise.all([loadOrders(1), loadHistory(1), loadOptions()]);
      setOrdersPage(1); setHistoryPage(1);
    } catch (error) { setErrorMessage(getApiErrorMessage(error)); }
  }

  // Calculated stats for List Tab
  const totalSupplierValue = useMemo(() => {
    return items.map(s => {
      const sOrders = allPurchaseOrders.filter(po => po.supplierId === s.id);
      const totalAmount = sOrders.reduce((sum, po) => sum + Number(po.totalAmount), 0);
      return { ...s, poCount: sOrders.length, totalAmount };
    });
  }, [items, allPurchaseOrders]);

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("suppliers.title")} description={t("suppliers.description")}>
          <Button onClick={openCreateForm}><Plus className="h-4 w-4" />{t("suppliers.add")}</Button>
        </PageHeader>

        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{successMessage}</div> : null}

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="list">{t("suppliers.tabs.list")}</TabsTrigger>
            <TabsTrigger value="purchaseOrders">{t("suppliers.tabs.purchaseOrders")}</TabsTrigger>
            <TabsTrigger value="history">{t("suppliers.tabs.history")}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-500">{t("suppliers.totalSuppliers")}</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{pagination?.totalItems || items.length}</div>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalSuppliersDesc")}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-500">{t("suppliers.active")}</div>
                <div className="mt-1 text-2xl font-bold text-emerald-600">{allSuppliers.length}</div>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.activeSuppliersDesc")}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-500">{t("suppliers.totalPurchaseValue")}</div>
                <div className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(allPurchaseOrders.reduce((sum, po) => sum + Number(po.totalAmount), 0))}</div>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalPurchaseValueDesc")}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-500">{t("suppliers.totalPurchaseOrders")}</div>
                <div className="mt-1 text-2xl font-bold text-blue-600">{allPurchaseOrders.length}</div>
                <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalPurchaseOrdersDesc")}</p>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
                  <Input placeholder={t("suppliers.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
                  <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                    <option value="ACTIVE">{t("status.ACTIVE")}</option>
                    <option value="INACTIVE">{t("status.INACTIVE")}</option>
                    <option value="">{t("common.all")}</option>
                  </Select>
                  <Button type="submit">{t("common.search")}</Button>
                </form>
              </CardContent>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogContent className="max-w-2xl bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
                <DialogHeader>
                  <DialogTitle>{editingItem ? t("suppliers.updateTitle") : t("suppliers.createTitle")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2 mt-2">
                  <div className="space-y-2"><Label>{t("suppliers.name")}</Label><Input {...form.register("name")} />{form.formState.errors.name ? <p className="text-sm text-destructive">{form.formState.errors.name.message}</p> : null}</div>
                  <div className="space-y-2"><Label>{t("suppliers.phone")}</Label><Input {...form.register("phone")} />{form.formState.errors.phone ? <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p> : null}</div>
                  <div className="space-y-2"><Label>{t("common.email")}</Label><Input {...form.register("email")} />{form.formState.errors.email ? <p className="text-sm text-destructive">{form.formState.errors.email.message}</p> : null}</div>
                  <div className="space-y-2 md:col-span-2"><Label>{t("suppliers.address")}</Label><Textarea {...form.register("address")} /></div>
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
                  <div className="w-full overflow-x-auto">
                    <DataTable className="rounded-none border-0 shadow-none">
                      <thead>
                        <tr>
                          <Th className="w-[90px] whitespace-nowrap">{t("common.no")}</Th>
                          <Th className="whitespace-nowrap">{t("common.name")}</Th>
                          <Th className="whitespace-nowrap">{t("common.phone")}</Th>
                          <Th className="whitespace-nowrap">{t("common.email")}</Th>
                          <Th className="whitespace-nowrap">{t("suppliers.address")}</Th>
                          <Th className="whitespace-nowrap">{t("suppliers.purchaseOrderCount")}</Th>
                          <Th className="whitespace-nowrap">{t("suppliers.totalPurchases")}</Th>
                          <Th className="whitespace-nowrap">{t("common.status")}</Th>
                          <Th className="whitespace-nowrap text-right">{t("common.actions")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {totalSupplierValue.map((item, index) => (
                          <tr key={item.id}>
                            <Td className="font-medium">{(page - 1) * PAGE_SIZE + index + 1}</Td>
                            <Td className="font-medium whitespace-nowrap"><div className="truncate max-w-[200px]" title={item.name}>{item.name}</div></Td>
                            <Td className="whitespace-nowrap">{item.phone || "-"}</Td>
                            <Td className="whitespace-nowrap">{item.email || "-"}</Td>
                            <Td className="max-w-[200px] break-words whitespace-normal font-medium">{item.address || "-"}</Td>
                            <Td className="whitespace-nowrap font-medium text-blue-600">{item.poCount || 0}</Td>
                            <Td className="whitespace-nowrap font-semibold text-amber-600">{item.totalAmount ? formatCurrency(item.totalAmount) : "0 VND"}</Td>
                            <Td className="whitespace-nowrap"><StatusBadge status={item.status} /></Td>
                            <Td className="whitespace-nowrap text-right">
                              <ActionMenu label={t("common.actions")} items={[{ label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(item) }, item.status === "ACTIVE" ? { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item), variant: "destructive" } : { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item) }]} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <PaginationControls pagination={pagination} onPageChange={setPage} />
          </TabsContent>

          <TabsContent value="purchaseOrders" className="space-y-6">
            <Card>
              <CardHeader><CardTitle>{t("purchaseOrders.createTitle")}</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={submitPurchaseOrder} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("products.supplier")}</Label>
                      <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
                        <option value="">{t("common.chooseSupplier")}</option>
                        {allSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.note")}</Label>
                      <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {draftItems.map((item, index) => (
                      <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_120px_160px_auto] md:items-end bg-slate-50">
                        <div className="space-y-2">
                          <Label>{t("products.product")}</Label>
                          <ProductCombobox products={products} value={item.productId} onChange={(value) => updateDraftItem(index, { productId: value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("reports.quantity")}</Label>
                          <Input type="number" min={1} value={item.quantity} onChange={(event) => updateDraftItem(index, { quantity: Number(event.target.value || 1) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("products.costPrice")}</Label>
                          <Input inputMode="numeric" value={formatMoneyInputValue(item.unitCost)} onChange={(event) => updateDraftItem(index, { unitCost: parseMoneyInput(event.target.value) })} />
                        </div>
                        <Button type="button" variant="outline" size="icon" onClick={() => removeDraftItem(index)} disabled={draftItems.length === 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button type="button" variant="outline" onClick={addDraftItem}>
                      <Plus className="h-4 w-4" />
                      {t("purchaseOrders.addItem")}
                    </Button>
                    <div className="font-semibold text-lg">{t("orders.total")}: <span className="text-amber-600">{formatCurrency(totalDraftAmount)}</span></div>
                  </div>

                  <Button type="submit">{t("common.save")}</Button>
                </form>
              </CardContent>
            </Card>

            {isOrdersLoading ? <LoadingState /> : null}
            {!isOrdersLoading && orders.length === 0 ? <EmptyState message={t("suppliers.emptyHistory")} /> : null}
            {!isOrdersLoading && orders.length > 0 ? (
              <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
                <CardContent className="p-0">
                  <div className="w-full overflow-x-auto">
                    <DataTable className="rounded-none border-0 shadow-none">
                      <thead>
                        <tr>
                          <Th className="whitespace-nowrap">{t("common.code")}</Th>
                          <Th className="whitespace-nowrap">{t("products.supplier")}</Th>
                          <Th className="whitespace-nowrap">{t("orders.total")}</Th>
                          <Th className="whitespace-nowrap">{t("inventory.operator")}</Th>
                          <Th className="whitespace-nowrap">{t("common.createdAt")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => (
                          <tr key={order.id}>
                            <Td className="whitespace-nowrap font-medium">{order.code}</Td>
                            <Td className="whitespace-nowrap"><div className="truncate max-w-[200px]" title={order.supplier?.name || String(order.supplierId)}>{order.supplier?.name || order.supplierId}</div></Td>
                            <Td className="whitespace-nowrap font-semibold text-emerald-600">{formatCurrency(order.totalAmount)}</Td>
                            <Td className="whitespace-nowrap">{order.user?.fullName || order.userId}</Td>
                            <Td className="whitespace-nowrap">{formatDateTime(order.createdAt)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <PaginationControls pagination={ordersPagination} onPageChange={setOrdersPage} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            {isHistoryLoading ? <LoadingState /> : null}
            {!isHistoryLoading && transactions.length === 0 ? <EmptyState message={t("suppliers.emptyHistory")} /> : null}
            {!isHistoryLoading && transactions.length > 0 ? (
              <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
                <CardContent className="p-0">
                  <div className="w-full overflow-x-auto">
                    <DataTable className="rounded-none border-0 shadow-none">
                      <thead>
                        <tr>
                          <Th className="whitespace-nowrap">{t("common.createdAt")}</Th>
                          <Th className="whitespace-nowrap">{t("products.product")}</Th>
                          <Th className="whitespace-nowrap text-center">{t("reports.quantity")}</Th>
                          <Th className="whitespace-nowrap">{t("inventory.operator")}</Th>
                          <Th className="whitespace-nowrap">{t("common.note")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.id}>
                            <Td className="whitespace-nowrap">{formatDateTime(tx.createdAt)}</Td>
                            <Td className="whitespace-nowrap font-medium">
                              <div className="truncate max-w-[250px]" title={tx.product?.name || String(tx.productId)}>
                                {tx.product?.name || tx.productId}
                              </div>
                            </Td>
                            <Td className="whitespace-nowrap text-center font-bold text-emerald-600">+{tx.quantity}</Td>
                            <Td className="whitespace-nowrap">{tx.user?.fullName || tx.userId}</Td>
                            <Td className="whitespace-nowrap">
                              <div className="truncate max-w-[200px]" title={tx.note || ""}>
                                {tx.note || "-"}
                              </div>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <PaginationControls pagination={historyPagination} onPageChange={setHistoryPage} />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
