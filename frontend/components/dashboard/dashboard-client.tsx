"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/language-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { formatChartDateVN } from "@/lib/date-format";
import { formatCurrency, formatNumber } from "@/lib/format";
import { orderService, paymentService, reportService } from "@/services/homex.service";
import type { Order, Payment, Product, ReportSummary, RevenueReportItem, TopProductReportItem } from "@/types/domain";

/* ─── KPI Summary Card (SORA-style) ─── */
type SummaryCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
  growth?: string;
  isWarning?: boolean;
};

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconBg = "bg-blue-50",
  iconColor = "text-blue-600",
  valueColor = "text-slate-800",
  growth,
  isWarning = false,
}: SummaryCardProps) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${isWarning ? "border-rose-200 ring-1 ring-rose-100" : "border-slate-200/80"}`}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{title}</p>
          <p className={`text-xl md:text-2xl font-black tracking-tight ${valueColor}`}>{value}</p>
          {growth ? <p className="text-[10px] font-bold text-emerald-600">{growth}</p> : null}
        </div>
        <div className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

/* ─── Cashier Quick Card ─── */
type CashierQuickCardProps = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge: string;
};

function CashierQuickCard({ title, description, href, icon: Icon, badge }: CashierQuickCardProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="group rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-7 w-7" />
        </div>
        <Badge variant="secondary" className="rounded-full">
          {badge}
        </Badge>
      </div>
      <div className="mt-6 space-y-2">
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
        <p className="min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary">
        <span>Mở nhanh</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </button>
  );
}

/* ─── Date Utility Helpers ─── */
function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function chartDateRange() {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(toDate.getDate() - 6);
  return { fromDate: toLocalIsoDate(fromDate), toDate: toLocalIsoDate(toDate) };
}

function normalizeIsoDate(value: string | number | Date | null | undefined) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function fillRevenueChartData(items: RevenueReportItem[], fromDate: string, toDate: string) {
  const revenueByDate = new Map<string, number>();
  items.forEach((item) => {
    const key = normalizeIsoDate(item.period);
    if (!key) return;
    revenueByDate.set(key, Number(item.revenue || 0));
  });
  return buildDateSeries(fromDate, toDate).map((period) => ({
    period,
    revenue: revenueByDate.get(period) || 0,
  }));
}

async function buildFallbackDashboardCharts(fromDate: string, toDate: string) {
  try {
    const [paymentData, orderData] = await Promise.all([
      paymentService.list({ page: 1, limit: 1000, status: "PAID" }),
      orderService.list({ page: 1, limit: 1000, status: "COMPLETED" }),
    ]);

    const paymentsInRange = paymentData.items.filter((payment) => {
      const key = normalizeIsoDate(payment.paidAt || payment.createdAt);
      return key >= fromDate && key <= toDate && payment.status === "PAID";
    });

    const revenueMap = new Map<string, { revenue: number; paymentCount: number }>();
    paymentsInRange.forEach((payment) => {
      const key = normalizeIsoDate(payment.paidAt || payment.createdAt);
      if (!key) return;
      const current = revenueMap.get(key) || { revenue: 0, paymentCount: 0 };
      current.revenue += Number(payment.amount || 0);
      current.paymentCount += 1;
      revenueMap.set(key, current);
    });

    const fallbackRevenueItems: RevenueReportItem[] = Array.from(revenueMap.entries()).map(([period, value]) => ({
      period,
      revenue: value.revenue,
      paymentCount: value.paymentCount,
    }));

    const productMap = new Map<number, TopProductReportItem>();
    orderData.items
      .filter((order) => {
        const key = normalizeIsoDate(order.createdAt);
        return key >= fromDate && key <= toDate && order.status === "COMPLETED";
      })
      .forEach((order) => {
        order.orderDetails.forEach((detail) => {
          const current = productMap.get(detail.productId) || {
            productId: detail.productId,
            product: detail.product || null,
            totalQuantity: 0,
            totalRevenue: 0,
          };
          current.totalQuantity += Number(detail.quantity || 0);
          current.totalRevenue += Number(detail.lineTotal || 0);
          if (!current.product && detail.product) current.product = detail.product;
          productMap.set(detail.productId, current);
        });
      });

    const fallbackTopProducts = Array.from(productMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    return { fallbackRevenueItems, fallbackTopProducts };
  } catch {
    return { fallbackRevenueItems: [] as RevenueReportItem[], fallbackTopProducts: [] as TopProductReportItem[] };
  }
}

function getStockLabel(product: Product) {
  return `${formatNumber(product.stockQuantity)}/${formatNumber(product.minStock)}`;
}

function formatRevenueChartDate(value: string | number | Date | null | undefined) {
  return formatChartDateVN(value);
}

const PAYMENT_METHOD_COLORS = ["#2563eb", "#0f766e", "#f59e0b", "#7c3aed"];

type PaymentMethodSummary = {
  method: string;
  total: number;
  count: number;
};

function buildPaymentMethodSummary(payments: Payment[]) {
  const methodMap = new Map<string, PaymentMethodSummary>();

  payments.forEach((payment) => {
    const method = payment.method || "CASH";
    const current = methodMap.get(method) || { method, total: 0, count: 0 };
    current.total += Number(payment.amount || 0);
    current.count += 1;
    methodMap.set(method, current);
  });

  return Array.from(methodMap.values()).sort((a, b) => b.total - a.total);
}

/* ─── Custom Recharts Tooltip ─── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900/95 px-3 py-2 text-white shadow-lg border border-slate-700">
      <p className="text-[10px] font-bold text-slate-300">{formatRevenueChartDate(label)}</p>
      <p className="text-xs font-black mt-0.5">{formatCurrency(Number(payload[0].value))}</p>
    </div>
  );
}

/* ─── Main Component ─── */
export default function DashboardPage() {
  const user = useCurrentUser();
  const { language, t } = useLanguage();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [revenueItems, setRevenueItems] = useState<RevenueReportItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductReportItem[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const range = useMemo(() => chartDateRange(), []);

  const cashierText = useMemo(() => {
    if (language === "en") {
      return {
        title: "Cashier Dashboard",
        description: "Quick access to the daily cashier workflow: sell, track orders, and look up warranties.",
        posTitle: "POS - Ready to sell",
        posDescription: "Open the sales counter, search products, add to cart, create drafts, and complete checkout.",
        ordersTitle: "Orders - Track transactions",
        ordersDescription: "Review recent orders, continue draft orders, and check transaction status.",
        warrantiesTitle: "Warranty - Quick lookup",
        warrantiesDescription: "Search warranty codes and view warranty details for customers at the counter.",
        quick: "Quick",
        daily: "Daily",
        lookup: "Lookup",
      };
    }
    return {
      title: "Dashboard thu ngân",
      description: "Truy cập nhanh các nghiệp vụ hằng ngày của thu ngân: bán hàng, theo dõi đơn và tra cứu bảo hành.",
      posTitle: "POS - Sẵn sàng bán hàng",
      posDescription: "Mở quầy bán hàng, tìm sản phẩm, thêm vào giỏ, tạo bản nháp và hoàn tất thanh toán.",
      ordersTitle: "Đơn hàng - Theo dõi giao dịch",
      ordersDescription: "Xem đơn hàng mới, tiếp tục đơn nháp và kiểm tra trạng thái giao dịch của khách.",
      warrantiesTitle: "Bảo hành - Tra cứu nhanh",
      warrantiesDescription: "Tra cứu mã bảo hành và xem thông tin bảo hành cho khách ngay tại quầy.",
      quick: "Nhanh",
      daily: "Hằng ngày",
      lookup: "Tra cứu",
    };
  }, [language]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;

    async function loadDashboard() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const [summaryData, revenueData, topProductData, lowStockData, recentOrderData, paymentData] = await Promise.all([
          reportService.summary(),
          reportService.revenue({ fromDate: range.fromDate, toDate: range.toDate, groupBy: "day" }),
          reportService.topProducts({ fromDate: range.fromDate, toDate: range.toDate, limit: 5 }),
          reportService.lowStock({ limit: 8 }),
          orderService.list({ page: 1, limit: 5, status: "COMPLETED", sortBy: "createdAt", sortOrder: "desc" }),
          paymentService.list({ page: 1, limit: 1000, status: "PAID" }),
        ]);

        let nextRevenueItems = revenueData.items || [];
        let nextTopProducts = topProductData.items || [];

        if (nextRevenueItems.length === 0 || nextTopProducts.length === 0) {
          const fallbackData = await buildFallbackDashboardCharts(range.fromDate, range.toDate);
          if (nextRevenueItems.length === 0 && fallbackData.fallbackRevenueItems.length > 0) {
            nextRevenueItems = fallbackData.fallbackRevenueItems;
          }
          if (nextTopProducts.length === 0 && fallbackData.fallbackTopProducts.length > 0) {
            nextTopProducts = fallbackData.fallbackTopProducts;
          }
        }

        setSummary(summaryData);
        setRevenueItems(nextRevenueItems);
        setTopProducts(nextTopProducts);
        setLowStockProducts(lowStockData.items || []);
        setRecentOrders(recentOrderData.items || []);
        setPaymentMethods(buildPaymentMethodSummary(paymentData.items || []));
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [range.fromDate, range.toDate, user?.role]);

  const revenueChartData = fillRevenueChartData(revenueItems, range.fromDate, range.toDate);

  const categoryChartData = Array.from(
    topProducts.reduce((categoryMap, item) => {
      const categoryName = item.product?.category?.name || t("common.notAvailable");
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + Number(item.totalQuantity || 0));
      return categoryMap;
    }, new Map<string, number>())
  )
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const hasRevenueChartData = revenueChartData.some((item) => item.revenue > 0);
  const hasCategoryChartData = categoryChartData.some((item) => item.quantity > 0);
  const hasPaymentMethodData = paymentMethods.some((item) => item.total > 0);

  if (!user) {
    return <LoadingState />;
  }

  // CASHIER: Dashboard tối giản
  if (user.role === "CASHIER") {
    return (
      <div className="min-w-0 space-y-5">
        <PageHeader title={cashierText.title} description={cashierText.description} />
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <CashierQuickCard title={cashierText.posTitle} description={cashierText.posDescription} href="/pos" icon={ShoppingCart} badge={cashierText.daily} />
          <CashierQuickCard title={cashierText.ordersTitle} description={cashierText.ordersDescription} href="/orders" icon={ReceiptText} badge={cashierText.quick} />
          <CashierQuickCard title={cashierText.warrantiesTitle} description={cashierText.warrantiesDescription} href="/warranties" icon={ShieldCheck} badge={cashierText.lookup} />
        </div>
      </div>
    );
  }

  // ─── ADMIN Dashboard ───
  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <div className="flex min-w-0 flex-col gap-1 border-b border-slate-200 pb-4">
        <h1 className="truncate text-xl font-black tracking-tight text-slate-800">{t("dashboard.adminTitle")}</h1>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 line-clamp-2">{t("dashboard.adminDescription")}</p>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      {/* Loading Skeleton */}
      {isLoading && !summary ? (
        <div className="space-y-6">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <Skeleton className="h-3 w-1/2 mb-3" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* KPI Cards - Row 1 (4 chính) */}
      {summary ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title={t("dashboard.netRevenue")}
              value={formatCurrency(summary.netRevenue)}
              icon={TrendingUp}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
          <SummaryCard title={t("orders.title")} value={formatNumber(summary.totalOrders)} icon={ReceiptText} iconBg="bg-violet-50" iconColor="text-violet-600" />
          <SummaryCard title={t("dashboard.customers")} value={formatNumber(summary.totalCustomers)} icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <SummaryCard
              title={t("dashboard.lowStock")}
              value={formatNumber(summary.lowStockProducts)}
              icon={AlertTriangle}
              iconBg="bg-rose-50"
              iconColor="text-rose-600"
              valueColor="text-rose-600"
              isWarning={summary.lowStockProducts > 0}
            />
        </div>
      ) : null}

      {/* Charts Section - Grid 12 cols */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Revenue Line Chart */}
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-black uppercase text-slate-700 tracking-wide">{t("dashboard.revenue7Days")}</h2>
          </div>
          <div className="min-h-[240px]">
            {hasRevenueChartData ? (
              <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={1}>
                <LineChart data={revenueChartData} margin={{ left: 8, right: 16, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={formatRevenueChartDate} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="revenue" name={t("dashboard.revenue")} stroke="#0f766e" strokeWidth={3} dot={{ r: 4, fill: "#0f766e", strokeWidth: 2, stroke: "#ffffff" }} activeDot={{ r: 6, fill: "#0f766e" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center">
                <EmptyState message={t("message.empty")} />
              </div>
            )}
          </div>
        </div>

        {/* Category Bar Chart */}
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-black uppercase text-slate-700 tracking-wide">{t("dashboard.topProducts")}</h2>
          </div>
          <div className="min-h-[240px]">
            {hasCategoryChartData ? (
              <ResponsiveContainer width="100%" height={240} minWidth={1} minHeight={1}>
                <BarChart data={categoryChartData} layout="vertical" margin={{ left: 8, right: 16, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} width={120} />
                  <Tooltip />
                  <Bar dataKey="quantity" name={t("dashboard.quantity")} fill="#0f766e" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="quantity" position="right" style={{ fontSize: 10, fontWeight: 700, fill: "#475569" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center">
                <EmptyState message={t("message.empty")} />
              </div>
            )}
          </div>
        </div>

        {/* Payment Method Donut */}
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">{t("payments.method")}</h2>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="min-h-[240px]">
            {hasPaymentMethodData ? (
              <div className="flex h-[240px] flex-col justify-between">
                <ResponsiveContainer width="100%" height={150} minWidth={1} minHeight={1}>
                  <PieChart>
                    <Pie data={paymentMethods} dataKey="total" nameKey="method" innerRadius={52} outerRadius={82} paddingAngle={3}>
                      {paymentMethods.map((entry, index) => (
                        <Cell key={entry.method} fill={PAYMENT_METHOD_COLORS[index % PAYMENT_METHOD_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [formatCurrency(Number(value)), t(`paymentMethod.${String(name)}`)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {paymentMethods.slice(0, 4).map((item, index) => (
                    <div key={item.method} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PAYMENT_METHOD_COLORS[index % PAYMENT_METHOD_COLORS.length] }} />
                        <span className="truncate font-bold text-slate-600">{t(`paymentMethod.${item.method}`)}</span>
                      </div>
                      <span className="shrink-0 font-black text-slate-800">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-[240px] items-center justify-center">
                <EmptyState message={t("message.empty")} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tables Section - Grid 12 cols */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">{t("orders.title")}</h2>
            <Button variant="outline" size="sm" className="text-[10px] font-bold" onClick={() => window.location.assign("/orders")}>
              {t("common.view")}
            </Button>
          </div>
          {recentOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-xs font-semibold text-slate-400">{t("message.empty")}</div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
              {recentOrders.map((order) => (
                <div key={order.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3 transition-colors hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-xs font-black text-slate-800" title={order.orderCode}>{order.orderCode}</p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">{formatRevenueChartDate(order.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs font-black text-slate-800">{formatCurrency(order.totalAmount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">{t("dashboard.lowStock")}</h2>
            <Button variant="outline" size="sm" className="text-[10px] font-bold" onClick={() => window.location.assign("/inventory")}>
              {t("nav.inventory")}
            </Button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-xs font-semibold text-slate-400">{t("message.noLowStock")}</div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3 transition-colors hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800" title={product.name}>{product.name}</p>
                    <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400" title={product.sku}>
                      {product.sku} - {product.category?.name || t("common.notAvailable")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-black text-rose-600">{getStockLabel(product)}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-500">{formatCurrency(product.salePrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">{t("dashboard.topProducts")}</h2>
            <Button variant="outline" size="sm" className="text-[10px] font-bold" onClick={() => window.location.assign("/reports")}>
              {t("nav.reports")}
            </Button>
          </div>
          {topProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-xs font-semibold text-slate-400">{t("message.empty")}</div>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 5).map((item, index) => (
                <div key={item.productId} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-black text-slate-600">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-800" title={item.product?.name || `#${item.productId}`}>{item.product?.name || `#${item.productId}`}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{formatCurrency(item.totalRevenue)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                    {formatNumber(item.totalQuantity)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
