"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ProductCombobox } from "@/components/shared/product-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { productService, purchaseOrderService, supplierService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Product, PurchaseOrder, Supplier } from "@/types/domain";

const PAGE_SIZE = 10;

type DraftItem = {
  productId: number;
  quantity: number;
  unitCost: number;
};

export default function PurchaseOrdersPage() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ productId: 0, quantity: 1, unitCost: 0 }]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const totalAmount = useMemo(() => draftItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0), [draftItems]);

  async function loadOptions() {
    const [productData, supplierData] = await Promise.all([
      productService.list({ page: 1, limit: 500, status: "ACTIVE" }),
      supplierService.list({ page: 1, limit: 500, status: "ACTIVE" }),
    ]);
    setProducts(productData.items);
    setSuppliers(supplierData.items);
  }

  async function loadOrders(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await purchaseOrderService.list({ page: currentPage, limit: PAGE_SIZE });
      setOrders(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOptions().catch((error) => setErrorMessage(getApiErrorMessage(error)));
    loadOrders(page);
  }, []);

  useEffect(() => {
    loadOrders(page);
  }, [page]);

  function updateDraftItem(index: number, patch: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addDraftItem() {
    setDraftItems((current) => [...current, { productId: 0, quantity: 1, unitCost: 0 }]);
  }

  function removeDraftItem(index: number) {
    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submitPurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setErrorMessage("");
      setSuccessMessage("");
      await purchaseOrderService.create({
        supplierId: Number(supplierId),
        note,
        items: draftItems,
      });
      setSupplierId("");
      setNote("");
      setDraftItems([{ productId: 0, quantity: 1, unitCost: 0 }]);
      setSuccessMessage(t("purchaseOrders.created"));
      await Promise.all([loadOptions(), loadOrders(1)]);
      setPage(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("purchaseOrders.title")} description={t("purchaseOrders.description")} />
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{successMessage}</div> : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("purchaseOrders.createTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPurchaseOrder} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("products.supplier")}</Label>
                  <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
                    <option value="">{t("common.chooseSupplier")}</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("common.note")}</Label>
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                {draftItems.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_120px_160px_auto] md:items-end">
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
                      <Input type="number" min={0} value={item.unitCost} onChange={(event) => updateDraftItem(index, { unitCost: Number(event.target.value || 0) })} />
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
                <div className="font-semibold">{t("orders.total")}: {formatCurrency(totalAmount)}</div>
              </div>

              <Button type="submit">{t("common.save")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && orders.length === 0 ? <EmptyState /> : null}
        {!isLoading && orders.length > 0 ? (
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              <DataTable noHorizontalScroll className="rounded-none border-0 shadow-none">
                <thead>
                  <tr>
                    <Th>{t("common.code")}</Th>
                    <Th>{t("products.supplier")}</Th>
                    <Th>{t("orders.total")}</Th>
                    <Th>{t("inventory.operator")}</Th>
                    <Th>{t("common.createdAt")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <Td>{order.code}</Td>
                      <Td>{order.supplier?.name || order.supplierId}</Td>
                      <Td className="font-semibold">{formatCurrency(order.totalAmount)}</Td>
                      <Td>{order.user?.fullName || order.userId}</Td>
                      <Td>{formatDateTime(order.createdAt)}</Td>
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
