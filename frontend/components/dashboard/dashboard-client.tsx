"use client";

import Link from "next/link";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Package,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis, Label } from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/language-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { formatChartDateVN } from "@/lib/date-format";
import { formatCurrency, formatNumber } from "@/lib/format";
import { orderService, paymentService, reportService, categoryService } from "@/services/homex.service";
import type { Order, Payment, Product, ReportSummary, RevenueReportItem, TopProductReportItem, Category } from "@/types/domain";

export function MoneyText({ value, size = "base" }: { value: number; size?: "sm" | "base" | "lg" | "xl" }) {
  const sizeClasses = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-xl",
    xl: "text-2xl xl:text-3xl",
  };
  return (
    <span className="whitespace-nowrap">
      <span className={`font-extrabold text-slate-950 ${sizeClasses[size]}`}>
        {formatNumber(value)}
      </span>
      <span className="ml-1 text-[11px] font-bold text-slate-400">VND</span>
    </span>
  );
}

function resolveProductImage(product: any) {
  const raw =
    product?.imageUrl ||
    product?.image ||
    product?.thumbnail ||
    product?.photoUrl ||
    product?.productImage ||
    "";

  if (!raw || typeof raw !== "string") return "";

  const value = raw.trim();

  if (!value) return "";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/assets/real-products/")) {
    return value;
  }

  if (value.startsWith("assets/real-products/")) {
    return `/${value}`;
  }

  if (value.startsWith("/")) {
    return value;
  }

  return `/assets/real-products/${value}`;
}

function ProductThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-400">
        <Package className="h-5 w-5" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      className="h-10 w-10 shrink-0 rounded-lg border border-slate-100 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

type GrowthInfo = {
  text: string;
  isNegative: boolean;
  isPositive: boolean;
  isZero: boolean;
};

function calculateGrowthInfo(today: number, yesterday: number, t: (key: string, params?: Record<string, string | number>) => string): GrowthInfo | null {
  if (yesterday === 0) {
    if (today === 0) return null;
    return {
      text: t("dashboard.comparedToYesterday", { percent: "+100%" }),
      isNegative: false,
      isPositive: true,
      isZero: false,
    };
  }
  const diff = today - yesterday;
  const percent = (diff / yesterday) * 100;
  const absPercent = Math.abs(percent).toFixed(1);
  return {
    text: t("dashboard.comparedToYesterday", { percent: `${absPercent}%` }),
    isNegative: percent < 0,
    isPositive: percent > 0,
    isZero: percent === 0,
  };
}

/* ─── KPI Summary Card (SORA-style) ─── */
type SummaryCardProps = {
  title: string;
  value: string | React.ReactNode;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
  accentBorderColor?: string;
  growthInfo?: GrowthInfo | null;
  warningText?: string;
  isWarning?: boolean;
};

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconBg = "bg-blue-50",
  iconColor = "text-blue-600",
  valueColor = "text-slate-950",
  accentBorderColor = "border-l-blue-500",
  growthInfo,
  warningText,
  isWarning = false,
}: SummaryCardProps) {
  return (
    <div
      className={`min-w-0 min-h-28 rounded-xl border border-slate-100 border-l-4 ${accentBorderColor} bg-white p-4 shadow-xs flex flex-col justify-between transition-all hover:shadow-md hover:-translate-y-0.5`}
    >
      <div className="flex justify-between items-start gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
        <div className={`w-9 h-9 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <div className="mt-2 min-w-0">
        <div className={`text-2xl font-extrabold tracking-tight truncate ${valueColor}`}>{value}</div>
        {isWarning && warningText ? (
          <span className="mt-2 flex w-max items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
            ↑ {warningText}
          </span>
        ) : growthInfo ? (
          <span
            className={cn(
              "mt-2 flex w-max items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              growthInfo.isNegative && "bg-rose-50 text-rose-600",
              growthInfo.isPositive && "bg-emerald-50 text-emerald-600",
              growthInfo.isZero && "bg-slate-100 text-slate-600"
            )}
          >
            {growthInfo.isNegative ? "↘" : growthInfo.isPositive ? "↗" : "→"} {growthInfo.text}
          </span>
        ) : null}
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
  const { t } = useLanguage();

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
        <span>{t("dashboard.quickOpen")}</span>
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
  const revenueByDate = new Map<string, { revenue: number; paymentCount: number }>();
  items.forEach((item) => {
    const key = normalizeIsoDate(item.period);
    if (!key) return;
    revenueByDate.set(key, {
      revenue: Number(item.revenue || 0),
      paymentCount: Number(item.paymentCount || 0),
    });
  });
  return buildDateSeries(fromDate, toDate).map((period) => {
    const data = revenueByDate.get(period) || { revenue: 0, paymentCount: 0 };
    return {
      period,
      revenue: data.revenue,
      paymentCount: data.paymentCount,
    };
  });
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

  return Array.from(methodMap.values())
    .filter(m => m.method !== "CARD")
    .sort((a, b) => b.total - a.total);
}

/* ─── Custom Recharts Tooltip ─── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload?: { paymentCount?: number } }>; label?: string }) {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const count = payload[0].payload?.paymentCount ?? 0;
  return (
    <div className="rounded-xl bg-slate-900/95 px-3.5 py-2 text-white shadow-lg border border-slate-700">
      <p className="text-[10px] font-bold text-slate-300">{formatRevenueChartDate(label)}</p>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-xs font-black">{formatNumber(payload[0].value)}</span>
        <span className="text-[10px] font-semibold text-slate-400">VND</span>
      </div>
      <div className="mt-1 pt-1 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px] text-slate-300">
        <span className="text-slate-400 font-medium">{t("dashboard.orderCountLabel")}</span>
        <span className="font-extrabold text-blue-400">{formatNumber(count)} {t("dashboard.ordersUnit")}</span>
      </div>
    </div>
  );
}

function DashboardChartFrame({ children }: { children: (width: number, height: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const height = 260;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const chartElement = element;

    function updateWidth() {
      const nextWidth = Math.floor(chartElement.getBoundingClientRect().width);
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    }

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(chartElement);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-[260px] min-h-[260px] w-full min-w-[1px]">
      {width > 0 ? children(width, height) : null}
    </div>
  );
}
function calculateGrowth(today: number, yesterday: number, t: (key: string, params?: Record<string, string | number>) => string) {
  if (yesterday === 0) {
    if (today === 0) return t("dashboard.noComparisonData");
    return t("dashboard.comparedToYesterday", { percent: "+100%" });
  }
  const diff = today - yesterday;
  const percent = (diff / yesterday) * 100;
  const sign = percent >= 0 ? "+" : "";
  return t("dashboard.comparedToYesterday", { percent: `${sign}${percent.toFixed(1)}%` });
}

/* ─── Main Component ─── */
export default function DashboardPage() {
  const user = useCurrentUser();
  const { language, t } = useLanguage();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [yesterdaySummary, setYesterdaySummary] = useState<ReportSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [revenueItems, setRevenueItems] = useState<RevenueReportItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductReportItem[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [revenuePeriod, setRevenuePeriod] = useState<"7days" | "30days">("7days");
  const [topProductRange, setTopProductRange] = useState<"7days" | "30days">("7days");

  const productRangeFilter = useMemo(() => {
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(toDate.getDate() - (topProductRange === "7days" ? 6 : 29));
    return { fromDate: toLocalIsoDate(fromDate), toDate: toLocalIsoDate(toDate) };
  }, [topProductRange]);

  const range = useMemo(() => {
    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setDate(toDate.getDate() - (revenuePeriod === "7days" ? 6 : 29));
    return { fromDate: toLocalIsoDate(fromDate), toDate: toLocalIsoDate(toDate) };
  }, [revenuePeriod]);

  const cashierText = useMemo(() => ({
    title: t("dashboard.cashierTitle"),
    description: t("dashboard.cashierDescription"),
    posTitle: t("dashboard.cashierPosTitle"),
    posDescription: t("dashboard.cashierPosDescription"),
    ordersTitle: t("dashboard.cashierOrdersTitle"),
    ordersDescription: t("dashboard.cashierOrdersDescription"),
    warrantiesTitle: t("dashboard.cashierWarrantiesTitle"),
    warrantiesDescription: t("dashboard.cashierWarrantiesDescription"),
    quick: t("dashboard.quick"),
    daily: t("dashboard.daily"),
    lookup: t("dashboard.lookup"),
  }), [t]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;

    async function loadDashboard() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const todayStr = toLocalIsoDate(new Date());
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = toLocalIsoDate(yesterdayDate);

        const [summaryData, yesterdaySummaryData, revenueData, lowStockData, recentOrderData, paymentData] = await Promise.all([
          reportService.summary({ fromDate: todayStr, toDate: todayStr }),
          reportService.summary({ fromDate: yesterdayStr, toDate: yesterdayStr }),
          reportService.revenue({ fromDate: range.fromDate, toDate: range.toDate, groupBy: "day" }),
          // topProducts fetched separately
          reportService.lowStock({ limit: 8 }),
          orderService.list({ page: 1, limit: 5, status: "COMPLETED", sortBy: "createdAt", sortOrder: "desc" }),
          paymentService.list({ page: 1, limit: 1000, status: "PAID" }),
        ]);

        let nextRevenueItems = revenueData.items || [];


        if (nextRevenueItems.length === 0) {
          const fallbackData = await buildFallbackDashboardCharts(range.fromDate, range.toDate);
          if (nextRevenueItems.length === 0 && fallbackData.fallbackRevenueItems.length > 0) {
            nextRevenueItems = fallbackData.fallbackRevenueItems;
          }
        }

        setSummary(summaryData);
        setYesterdaySummary(yesterdaySummaryData);
        setRevenueItems(nextRevenueItems);

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

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    async function loadTopProducts() {
      try {
        const [data, categoryData] = await Promise.all([
          reportService.topProducts({ fromDate: productRangeFilter.fromDate, toDate: productRangeFilter.toDate, limit: 100 }),
          categoryService.list({ limit: 100 })
        ]);
        setTopProducts(data.items || []);
        setCategories(categoryData.items || []);
      } catch (error) {
        console.error("Failed to load top products", error);
      }
    }
    loadTopProducts();
  }, [productRangeFilter, user?.role]);

  const revenueChartData = fillRevenueChartData(revenueItems, range.fromDate, range.toDate);

  const hasRevenueChartData = revenueChartData.some((item) => item.revenue > 0);
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
    <div className="min-w-0 space-y-4">
      <PageHeader title={t("dashboard.adminTitle")} description={t("dashboard.adminDescription")} />

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      {/* Loading Skeleton */}
      {isLoading && !summary ? (
        <div className="space-y-4">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <Skeleton className="h-3 w-1/2 mb-3" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Row 1: KPI Cards */}
      {summary ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
          <SummaryCard
            title={t("dashboard.todayRevenue")}
            value={<MoneyText value={summary.netRevenue} size="xl" />}
            icon={TrendingUp}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            accentBorderColor="border-l-blue-500"
            growthInfo={calculateGrowthInfo(summary.netRevenue, yesterdaySummary?.netRevenue || 0, t)}
          />
          <SummaryCard
            title={t("dashboard.orders")}
            value={`${formatNumber(summary.totalOrders)} ${t("orders.title")}`}
            icon={ReceiptText}
            iconBg="bg-purple-50"
            iconColor="text-purple-600"
            accentBorderColor="border-l-purple-500"
            growthInfo={calculateGrowthInfo(summary.totalOrders, yesterdaySummary?.totalOrders || 0, t)}
          />
          <SummaryCard
            title={t("dashboard.productsSold")}
            value={`${formatNumber(summary.productsSold)} ${t("products.title")}`}
            icon={Package}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            accentBorderColor="border-l-emerald-500"
            growthInfo={calculateGrowthInfo(summary.productsSold, yesterdaySummary?.productsSold || 0, t)}
          />
          <SummaryCard
            title={t("dashboard.lowStockWarning")}
            value={`${formatNumber(summary.lowStockProducts)} ${t("products.title")}`}
            icon={AlertTriangle}
            iconBg="bg-rose-50"
            iconColor="text-rose-600"
            valueColor="text-rose-600"
            accentBorderColor="border-l-rose-500"
            isWarning={summary.lowStockProducts > 0}
            warningText={summary.lowStockProducts > 0 ? t("dashboard.lowStockCount", { count: summary.lowStockProducts }) : undefined}
          />
        </div>
      ) : null}

      {/* Row 2: Chart chính (Doanh thu & Phương thức TT) */}
      <div className="grid min-w-0 grid-cols-12 gap-4 mb-4 items-stretch">
        {/* Doanh thu 7 ngày */}
        <div className="col-span-12 xl:col-span-8 min-w-0 flex h-[360px] flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide">
              {revenuePeriod === "7days" ? t("dashboard.revenue7Days") : t("dashboard.revenue30Days")}
            </h2>
            <select
              value={revenuePeriod}
              onChange={(e) => setRevenuePeriod(e.target.value as "7days" | "30days")}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="7days">{t("dashboard.last7DaysOption")}</option>
              <option value="30days">{t("dashboard.last30DaysOption")}</option>
            </select>
          </div>
          <div className="min-h-[260px] flex-1">
            {hasRevenueChartData ? (
              <DashboardChartFrame>
                {(width, height) => (
                  <AreaChart width={width} height={height} data={revenueChartData} margin={{ left: 8, right: 16, top: 10, bottom: 0 }}>
<defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={formatRevenueChartDate} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} width={45} tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(0)}M` : formatNumber(val)} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3'}} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" activeDot={{ r: 6, fill: "#3b82f6", stroke: "#ffffff", strokeWidth: 2 }} />
                  </AreaChart>
                )}
              </DashboardChartFrame>
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState message={t("message.empty")} />
              </div>
            )}
          </div>
        </div>

        {/* Phương thức thanh toán */}
        <div className="col-span-12 xl:col-span-4 min-w-0 flex h-[360px] flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{t("dashboard.categoryTracker")}</h2>
          </div>
          {categories.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState message={t("message.empty")} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-2">
              {(() => {
                const categoryTrackerItems = categories.map((category) => {
                  const matchingProduct = topProducts.filter(p => p.product?.category?.id === category.id);
                  const totalQty = matchingProduct.reduce((sum, item) => sum + Number(item.totalQuantity || 0), 0);
                  const totalRev = matchingProduct.reduce((sum, item) => sum + Number(item.totalRevenue || 0), 0);
                  return { category, totalQty, totalRev };
                }).sort((a, b) => {
                  if (b.totalQty !== a.totalQty) {
                    return b.totalQty - a.totalQty;
                  }
                  if (b.totalRev !== a.totalRev) {
                    return b.totalRev - a.totalRev;
                  }
                  return String(a.category.name || "").localeCompare(String(b.category.name || ""), "vi");
                });

                const maxQty = Math.max(0, ...categoryTrackerItems.map(c => c.totalQty));

                return categoryTrackerItems.map(({ category, totalQty, totalRev }) => {
                  const percent = maxQty > 0 ? (totalQty / maxQty) * 100 : (totalRev > 0 ? 3 : 0);
                  return (
                    <div key={category.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-bold text-slate-900" title={category.name}>
                            {category.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {t("dashboard.sold")}: {formatNumber(totalQty)} {t("dashboard.itemsUnit")}
                          </p>
                        </div>
                        <MoneyText value={totalRev} size="sm" />
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Sắp hết hàng & Top bán chạy */}
      <div className="grid min-w-0 grid-cols-12 gap-4 items-stretch mb-6">
        {/* Sắp hết hàng */}
        <div className="col-span-12 xl:col-span-6 min-w-0 flex h-[360px] flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{t("dashboard.lowStockProducts")}</h2>
            <Link href="/inventory" className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-100">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {lowStockProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs font-semibold text-slate-400">{t("dashboard.noData")}</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div key={product.id} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
                  <ProductThumb src={resolveProductImage(product)} alt={product.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900" title={product.name}>{product.name}</p>
                    <p className="truncate text-xs text-slate-500" title={`${product.sku} ${product.category?.name ? `- ${product.category.name}` : ""}`}>
                      {product.sku} {product.category?.name ? `- ${product.category.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black tracking-widest ${product.stockQuantity <= 0 ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                      {product.stockQuantity <= 0 ? t("dashboard.outOfStock") : t("dashboard.low")}
                    </span>
                    <p className="text-xs font-semibold text-slate-500">
                      {t("dashboard.stock")}: <strong className="text-slate-800">{formatNumber(product.stockQuantity)}</strong>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top bán chạy */}
        <div className="col-span-12 xl:col-span-6 min-w-0 flex h-[360px] flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">{t("dashboard.topSelling")}</h2>
            <Link href="/reports" className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-100">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {topProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs font-semibold text-slate-400">{t("dashboard.noData")}</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {topProducts.slice(0, 5).map((item, index) => (
                <div key={item.productId} className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
                  <span className="w-5 text-sm font-bold text-slate-300">{index + 1}</span>
                  <ProductThumb src={resolveProductImage(item.product)} alt={item.product?.name || ""} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900" title={item.product?.name || `#${item.productId}`}>
                      {item.product?.name || `#${item.productId}`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{t("dashboard.sold")}: {formatNumber(item.totalQuantity)}</p>
                  </div>
                  <MoneyText value={item.totalRevenue} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
