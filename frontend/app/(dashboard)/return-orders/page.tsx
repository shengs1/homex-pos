"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { orderService, returnOrderService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Order, ReturnOrder } from "@/types/domain";

const PAGE_SIZE = 10;

export default function ReturnOrdersPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<ReturnOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [orderCodeSearch, setOrderCodeSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadReturns(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await returnOrderService.list({ page: currentPage, limit: PAGE_SIZE });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReturns(page);
  }, [page]);

  async function findOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setErrorMessage("");
      setSuccessMessage("");
      const data = await orderService.list({ page: 1, limit: 10, search: orderCodeSearch, status: "COMPLETED" });
      const order = data.items.find((item) => item.orderCode.toLowerCase() === orderCodeSearch.trim().toLowerCase()) || data.items[0];

      if (!order) {
        setSelectedOrder(null);
        setErrorMessage(t("returnOrders.orderNotFound"));
        return;
      }

      const detail = await orderService.detail(order.id);
      setSelectedOrder(detail);
      setQuantities({});
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function submitReturnOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    const returnItems = Object.entries(quantities)
      .map(([orderDetailId, quantity]) => ({ orderDetailId: Number(orderDetailId), quantity: Number(quantity || 0) }))
      .filter((item) => item.quantity > 0);

    try {
      setErrorMessage("");
      setSuccessMessage("");
      await returnOrderService.create({
        orderId: selectedOrder.id,
        reason,
        items: returnItems,
      });
      setSelectedOrder(null);
      setQuantities({});
      setReason("");
      setSuccessMessage(t("returnOrders.created"));
      await loadReturns(1);
      setPage(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("returnOrders.title")} description={t("returnOrders.description")} />
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("returnOrders.createTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={findOrder} className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input value={orderCodeSearch} onChange={(event) => setOrderCodeSearch(event.target.value)} placeholder={t("orders.orderCode")} />
              <Button type="submit">{t("warranties.findOrder")}</Button>
            </form>

            {selectedOrder ? (
              <form onSubmit={submitReturnOrder} className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="font-semibold">{selectedOrder.orderCode}</div>
                  <div>{t("orders.total")}: {formatCurrency(selectedOrder.totalAmount)}</div>
                </div>

                <DataTable noHorizontalScroll>
                  <thead>
                    <tr>
                      <Th>{t("products.product")}</Th>
                      <Th>{t("reports.quantity")}</Th>
                      <Th>{t("returnOrders.returnQuantity")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.orderDetails.map((detail) => (
                      <tr key={detail.id}>
                        <Td>{detail.product?.name || detail.productId}</Td>
                        <Td>{detail.quantity}</Td>
                        <Td>
                          <Input
                            type="number"
                            min={0}
                            max={detail.quantity}
                            value={quantities[detail.id] || 0}
                            onChange={(event) => setQuantities((current) => ({ ...current, [detail.id]: Number(event.target.value || 0) }))}
                          />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>

                <div className="space-y-2">
                  <Label>{t("returnOrders.reason")}</Label>
                  <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
                </div>
                <Button type="submit">{t("returnOrders.create")}</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable>
            <thead>
              <tr>
                <Th>{t("common.code")}</Th>
                <Th>{t("orders.orderCode")}</Th>
                <Th>{t("orders.total")}</Th>
                <Th>{t("inventory.operator")}</Th>
                <Th>{t("common.createdAt")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td>{item.returnCode}</Td>
                  <Td>{item.order?.orderCode || item.orderId}</Td>
                  <Td>{formatCurrency(item.totalAmount)}</Td>
                  <Td>{item.user?.fullName || item.userId}</Td>
                  <Td>{formatDateTime(item.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}
