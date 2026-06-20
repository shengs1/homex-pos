"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { CustomerReportItem, Product, ProfitReportItem, ReportSummary, TopCustomerReportItem, TopProductReportItem } from "@/types/domain";

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 30);
  return {
    fromDate: toLocalIsoDate(fromDate),
    toDate: toLocalIsoDate(toDate),
  };
}

function normalizeIsoDate(value: string | number | Date | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return toLocalIsoDate(date);
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function buildDateSeries(fromDate: string, toDate: string) {
  const result: string[] = [];
  let cursor = fromDate;

  while (cursor <= toDate) {
    result.push(cursor);
    cursor = addDaysToIsoDate(cursor, 1);
  }

  return result;
}

function fillProfitChartData(items: ProfitReportItem[], fromDate: string, toDate: string) {
  const profitByDate = new Map<string, ProfitReportItem>();

  items.forEach((item) => {
    const key = normalizeIsoDate(item.period);
    if (key) profitByDate.set(key, item);
  });

  return buildDateSeries(fromDate, toDate).map((period) => {
    const item = profitByDate.get(period);
    return {
      period,
      revenue: Number(item?.revenue || 0),
      cogs: Number(item?.cogs || 0),
      netProfit: Number(item?.netProfit || 0),
    };
  });
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-slate-800" title={value}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useLanguage();
  const initialDateRange = defaultDateRange();
  const [fromDate, setFromDate] = useState(initialDateRange.fromDate);
  const [toDate, setToDate] = useState(initialDateRange.toDate);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [profitItems, setProfitItems] = useState<ProfitReportItem[]>([]);
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
      const params = { fromDate, toDate, limit: 10 };
      const [summaryData, profitData, topProductData, topCustomerData, lowStockData, customersData] = await Promise.all([
        reportService.summary(params),
        reportService.profit({ ...params, groupBy: "day" }),
        reportService.topProducts(params),
        reportService.topCustomers(params),
        reportService.lowStock({ limit: 8 }),
        reportService.customers(params),
      ]);

      setSummary(summaryData);
      setProfitItems(profitData.items || []);
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

  const profitChartData = useMemo(() => fillProfitChartData(profitItems, fromDate, toDate), [fromDate, profitItems, toDate]);
  const profitTotals = useMemo(() => {
    return profitChartData.reduce(
      (total, item) => {
        total.revenue += item.revenue;
        total.cogs += item.cogs;
        total.netProfit += item.netProfit;
        return total;
      },
      { revenue: 0, cogs: 0, netProfit: 0 }
    );
  }, [profitChartData]);
  const topProductChartData = topProducts.slice(0, 10).map((item) => ({
    name: item.product?.name || String(item.productId),
    quantity: Number(item.totalQuantity || 0),
    revenue: Number(item.totalRevenue || 0),
  }));
  const hasProfitChartData = profitChartData.some((item) => item.revenue > 0 || item.cogs > 0 || item.netProfit !== 0);
  const hasTopProductChartData = topProductChartData.some((item) => item.quantity > 0);

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="w-full min-w-0 space-y-6 overflow-hidden">
        <PageHeader title={t("reports.title")} description={t("reports.description")} />
        <ErrorState message={errorMessage} />

        <Card className="w-full min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleApply} className="flex w-full flex-wrap items-end gap-4">
              <DateFilterInput label={t("reports.fromDate")} value={fromDate} onChange={setFromDate} className="w-full min-w-[200px] md:w-[220px]" />
              <DateFilterInput label={t("reports.toDate")} value={toDate} onChange={setToDate} className="w-full min-w-[200px] md:w-[220px]" />
              <Button type="submit" className="w-full md:w-auto">{t("reports.apply")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}

        {summary ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryBox label={t("reports.revenue")} value={formatCurrency(profitTotals.revenue || summary.netRevenue)} />
            <SummaryBox label={t("reports.cogs")} value={formatCurrency(profitTotals.cogs)} />
            <SummaryBox label={t("reports.netProfit")} value={formatCurrency(profitTotals.netProfit)} />
            <SummaryBox label={t("dashboard.completedOrders")} value={formatNumber(summary.completedOrders)} />
          </div>
        ) : null}

        <div className="grid w-full min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("reports.profitChart")}</CardTitle></CardHeader>
            <CardContent className="min-h-[320px] min-w-0">
              {hasProfitChartData ? (
                <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
                  <LineChart data={profitChartData} margin={{ left: 4, right: 12, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatChartDateVN} />
                    <YAxis tick={{ fontSize: 12 }} width={72} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(label) => formatChartDateVN(label)} />
                    <Line type="monotone" dataKey="revenue" name={t("reports.revenue")} stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="cogs" name={t("reports.cogs")} stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="netProfit" name={t("reports.netProfit")} stroke="#059669" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed">
                  <EmptyState message={t("reports.noProfitData")} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("reports.topProducts")}</CardTitle></CardHeader>
            <CardContent className="min-h-[320px] min-w-0">
              {hasTopProductChartData ? (
                <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
                  <BarChart data={topProductChartData} layout="vertical" margin={{ left: 4, right: 12, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value, name) => name === "revenue" ? formatCurrency(Number(value)) : formatNumber(Number(value))} />
                    <Bar dataKey="quantity" name={t("reports.quantity")} fill="#2563eb" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed">
                  <EmptyState message={t("reports.noTopProductData")} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("reports.topProducts")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {topProducts.length === 0 ? <EmptyState /> : (
                <DataTable noHorizontalScroll>
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

          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("reports.topCustomers")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {topCustomers.length === 0 ? <EmptyState /> : (
                <DataTable noHorizontalScroll>
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

          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("reports.lowStock")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {lowStockProducts.length === 0 ? <EmptyState message={t("message.noLowStock")} /> : (
                <DataTable noHorizontalScroll>
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

          <Card className="min-w-0 rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("reports.customers")}</CardTitle></CardHeader>
            <CardContent className="min-w-0">
              {customerItems.length === 0 ? <EmptyState /> : (
                <DataTable noHorizontalScroll>
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
