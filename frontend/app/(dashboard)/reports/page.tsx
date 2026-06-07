"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatChartDateVN } from "@/lib/date-format";
import { formatCurrency, formatNumber } from "@/lib/format";
import { reportService } from "@/services/homex.service";
import type { CustomerReportItem, Product, ReportSummary, RevenueReportItem, TopCustomerReportItem, TopProductReportItem } from "@/types/domain";

function defaultDateRange() {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 30);
  return {
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
  };
}

function formatRevenueChartDate(value: string | number | Date | null | undefined) {
  return formatChartDateVN(value);
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-xl font-bold" title={value}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useLanguage();
  const initialDateRange = defaultDateRange();
  const [fromDate, setFromDate] = useState(initialDateRange.fromDate);
  const [toDate, setToDate] = useState(initialDateRange.toDate);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [revenueItems, setRevenueItems] = useState<RevenueReportItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductReportItem[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomerReportItem[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [customerItems, setCustomerItems] = useState<CustomerReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadReports() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const params = { fromDate, toDate, limit: 8 };
      const [summaryData, revenueData, topProductData, topCustomerData, lowStockData, customersData] = await Promise.all([
        reportService.summary(params),
        reportService.revenue({ ...params, groupBy: "day" }),
        reportService.topProducts(params),
        reportService.topCustomers(params),
        reportService.lowStock({ limit: 8 }),
        reportService.customers(params),
      ]);
      setSummary(summaryData);
      setRevenueItems(revenueData.items || []);
      setTopProducts(topProductData.items || []);
      setTopCustomers(topCustomerData.items || []);
      setLowStockProducts(lowStockData.items || []);
      setCustomerItems(customersData.items || []);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  function handleApply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadReports();
  }

  const revenueChartData = revenueItems.map((item) => ({ period: item.period, revenue: Number(item.revenue || 0) }));
  const topProductChartData = topProducts.slice(0, 5).map((item) => ({ name: item.product?.name || `#${item.productId}`, quantity: Number(item.totalQuantity || 0) }));

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="w-full min-w-0 space-y-6 overflow-hidden">
        <PageHeader title={t("reports.title")} description={t("reports.description")} />
        <ErrorState message={errorMessage} />

        {/* Compact filter toolbar */}
        <Card className="w-full min-w-0">
          <CardContent className="pt-6">
            <form onSubmit={handleApply} className="flex w-full flex-wrap items-end gap-4">
              <DateFilterInput
                label={t("reports.fromDate")}
                value={fromDate}
                onChange={setFromDate}
                className="w-full min-w-[200px] md:w-[220px]"
              />
              <DateFilterInput
                label={t("reports.toDate")}
                value={toDate}
                onChange={setToDate}
                className="w-full min-w-[200px] md:w-[220px]"
              />
              <Button type="submit" className="w-full md:w-auto">{t("reports.apply")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}

        {/* Summary numbers */}
        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryBox label={t("dashboard.netRevenue")} value={formatCurrency(summary.netRevenue)} />
            <SummaryBox label={t("dashboard.grossRevenue")} value={formatCurrency(summary.grossRevenue)} />
            <SummaryBox label={t("dashboard.completedOrders")} value={formatNumber(summary.completedOrders)} />
            <SummaryBox label={t("dashboard.lowStock")} value={formatNumber(summary.lowStockProducts)} />
          </div>
        ) : null}

        {/* Chart grid */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader><CardTitle>{t("reports.revenueChart")}</CardTitle></CardHeader>
            <CardContent className="min-h-[320px] min-w-0">
              <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
                <LineChart data={revenueChartData} margin={{ left: 4, right: 12, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatRevenueChartDate} />
                  <YAxis tick={{ fontSize: 12 }} width={72} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(label) => formatRevenueChartDate(label)} />
                  <Line type="monotone" dataKey="revenue" name={t("reports.revenue")} stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader><CardTitle>{t("reports.topProducts")}</CardTitle></CardHeader>
            <CardContent className="min-h-[320px] min-w-0">
              <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
                <BarChart data={topProductChartData} layout="vertical" margin={{ left: 4, right: 12, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name={t("reports.quantity")} fill="#2563eb" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Data table grid */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader><CardTitle>{t("reports.topProducts")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {topProducts.length === 0 ? <EmptyState /> : (
                <DataTable noHorizontalScroll>
                  <colgroup><col className="w-[52%]" /><col className="w-[18%]" /><col className="w-[30%]" /></colgroup>
                  <thead><tr><Th>{t("products.product")}</Th><Th>{t("reports.quantity")}</Th><Th>{t("reports.revenue")}</Th></tr></thead>
                  <tbody>
                    {topProducts.map((item) => (
                      <tr key={item.productId}>
                        <Td><div className="line-clamp-2 font-medium" title={item.product?.name || String(item.productId)}>{item.product?.name || item.productId}</div><div className="truncate text-xs text-muted-foreground">{item.product?.sku || "-"}</div></Td>
                        <Td>{formatNumber(item.totalQuantity)}</Td>
                        <Td>{formatCurrency(item.totalRevenue)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader><CardTitle>{t("reports.topCustomers")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {topCustomers.length === 0 ? <EmptyState /> : (
                <DataTable noHorizontalScroll>
                  <colgroup><col className="w-[52%]" /><col className="w-[18%]" /><col className="w-[30%]" /></colgroup>
                  <thead><tr><Th>{t("customers.title")}</Th><Th>{t("reports.totalOrders")}</Th><Th>{t("reports.totalSpent")}</Th></tr></thead>
                  <tbody>
                    {topCustomers.map((item, index) => (
                      <tr key={`${item.customerId || "retail"}-${index}`}>
                        <Td><div className="line-clamp-2 font-medium" title={item.customer?.fullName || t("customers.retail")}>{item.customer?.fullName || t("customers.retail")}</div><div className="truncate text-xs text-muted-foreground">{item.customer?.phone || "-"}</div></Td>
                        <Td>{formatNumber(item.totalOrders)}</Td>
                        <Td>{formatCurrency(item.totalSpent)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader><CardTitle>{t("reports.lowStock")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {lowStockProducts.length === 0 ? <EmptyState message={t("message.noLowStock")} /> : (
                <DataTable noHorizontalScroll>
                  <colgroup><col className="w-[25%]" /><col className="w-[45%]" /><col className="w-[15%]" /><col className="w-[15%]" /></colgroup>
                  <thead><tr><Th>{t("products.sku")}</Th><Th>{t("products.product")}</Th><Th>{t("products.stock")}</Th><Th>{t("products.minStock")}</Th></tr></thead>
                  <tbody>
                    {lowStockProducts.map((item) => (
                      <tr key={item.id}>
                        <Td><div className="truncate" title={item.sku}>{item.sku}</div></Td>
                        <Td><div className="line-clamp-2 font-medium" title={item.name}>{item.name}</div></Td>
                        <Td className="font-bold text-destructive">{item.stockQuantity}</Td>
                        <Td>{item.minStock}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader><CardTitle>{t("reports.customers")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {customerItems.length === 0 ? <EmptyState /> : (
                <DataTable noHorizontalScroll>
                  <colgroup><col className="w-[42%]" /><col className="w-[18%]" /><col className="w-[22%]" /><col className="w-[18%]" /></colgroup>
                  <thead><tr><Th>{t("customers.title")}</Th><Th>{t("reports.totalOrders")}</Th><Th>{t("reports.totalSpent")}</Th><Th>{t("reports.latestOrder")}</Th></tr></thead>
                  <tbody>
                    {customerItems.map((item) => (
                      <tr key={item.id}>
                        <Td><div className="line-clamp-2 font-medium" title={item.fullName}>{item.fullName}</div><div className="truncate text-xs text-muted-foreground">{item.phone}</div></Td>
                        <Td>{formatNumber(item.totalOrders)}</Td>
                        <Td>{formatCurrency(item.totalSpent)}</Td>
                        <Td><div className="truncate" title={item.latestOrder?.orderCode || "-"}>{item.latestOrder?.orderCode || "-"}</div></Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
}
