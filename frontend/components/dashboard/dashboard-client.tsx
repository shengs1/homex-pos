"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { formatChartDateVN } from "@/lib/date-format";
import { formatCurrency, formatNumber } from "@/lib/format";
import { orderService, paymentService, reportService } from "@/services/homex.service";
import type { Product, ReportSummary, RevenueReportItem, TopProductReportItem } from "@/types/domain";

type SummaryCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
};

function SummaryCard({ title, value, icon: Icon }: SummaryCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

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
      className="group rounded-2xl border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
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

export default function DashboardPage() {
  const user = useCurrentUser();
  const { language, t } = useLanguage();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [revenueItems, setRevenueItems] = useState<RevenueReportItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductReportItem[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
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

        const [summaryData, revenueData, topProductData, lowStockData] = await Promise.all([
          reportService.summary(),
          reportService.revenue({ fromDate: range.fromDate, toDate: range.toDate, groupBy: "day" }),
          reportService.topProducts({ fromDate: range.fromDate, toDate: range.toDate, limit: 5 }),
          reportService.lowStock({ limit: 8 }),
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
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [range.fromDate, range.toDate, user?.role]);

  const revenueChartData = fillRevenueChartData(revenueItems, range.fromDate, range.toDate);

  const topProductChartData = topProducts.map((item) => ({
    name: item.product?.name || `#${item.productId}`,
    quantity: Number(item.totalQuantity || 0),
  }));

  const hasRevenueChartData = revenueChartData.some((item) => item.revenue > 0);
  const hasTopProductChartData = topProductChartData.some((item) => item.quantity > 0);

  if (!user) {
    return <LoadingState />;
  }

  // CASHIER: Dashboard tối giản, chỉ có 3 card điều hướng nhanh.
  if (user.role === "CASHIER") {
    return (
      <div className="space-y-6">
        <PageHeader title={cashierText.title} description={cashierText.description} />

        <div className="grid gap-5 md:grid-cols-3">
          <CashierQuickCard
            title={cashierText.posTitle}
            description={cashierText.posDescription}
            href="/pos"
            icon={ShoppingCart}
            badge={cashierText.daily}
          />
          <CashierQuickCard
            title={cashierText.ordersTitle}
            description={cashierText.ordersDescription}
            href="/orders"
            icon={ReceiptText}
            badge={cashierText.quick}
          />
          <CashierQuickCard
            title={cashierText.warrantiesTitle}
            description={cashierText.warrantiesDescription}
            href="/warranties"
            icon={ShieldCheck}
            badge={cashierText.lookup}
          />
        </div>
      </div>
    );
  }

  // ADMIN: Dashboard quản trị đầy đủ KPI, biểu đồ và cảnh báo tồn kho thấp.
  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.adminTitle")} description={t("dashboard.adminDescription")} />

      {errorMessage ? <ErrorState message={errorMessage} /> : null}
      {isLoading ? <LoadingState /> : null}

      {summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title={t("dashboard.netRevenue")} value={formatCurrency(summary.netRevenue)} icon={BarChart3} />
          <SummaryCard title={t("dashboard.grossRevenue")} value={formatCurrency(summary.grossRevenue)} icon={WalletCards} />
          <SummaryCard title={t("dashboard.completedOrders")} value={formatNumber(summary.completedOrders)} icon={ReceiptText} />
          <SummaryCard title={t("dashboard.draftOrders")} value={formatNumber(summary.draftOrders)} icon={ReceiptText} />
          <SummaryCard title={t("dashboard.customers")} value={formatNumber(summary.totalCustomers)} icon={Users} />
          <SummaryCard title={t("dashboard.activeProducts")} value={formatNumber(summary.activeProducts)} icon={Package} />
          <SummaryCard title={t("dashboard.lowStock")} value={formatNumber(summary.lowStockProducts)} icon={Boxes} />
          <SummaryCard title={t("dashboard.activeWarranties")} value={formatNumber(summary.activeWarranties)} icon={ShieldCheck} />
        </div>
      ) : null}

      <div className="grid w-full min-w-0 gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="min-w-0 shadow-sm">
          <CardHeader>
            <CardTitle>{t("dashboard.revenue7Days")}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[320px] min-w-0">
            {hasRevenueChartData ? (
              <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
                <LineChart data={revenueChartData} margin={{ left: 8, right: 16, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatRevenueChartDate} />
                  <YAxis tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(label) => formatRevenueChartDate(label)} />
                  <Line type="monotone" dataKey="revenue" name={t("dashboard.revenue")} stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed">
                <EmptyState message="Chưa có dữ liệu doanh thu trong khoảng 7 ngày gần nhất." />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 shadow-sm">
          <CardHeader>
            <CardTitle>{t("dashboard.topProducts")}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-[320px] min-w-0">
            {hasTopProductChartData ? (
              <ResponsiveContainer width="100%" height={320} minWidth={1} minHeight={1}>
                <BarChart data={topProductChartData} layout="vertical" margin={{ left: 8, right: 16, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="quantity" name={t("dashboard.quantity")} fill="#2563eb" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed">
                <EmptyState message="Chưa có dữ liệu sản phẩm bán chạy trong khoảng 7 ngày gần nhất." />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t("dashboard.lowStock")}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => window.location.assign("/inventory")}>
            {t("nav.inventory")}
          </Button>
        </CardHeader>
        <CardContent>
          {lowStockProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("message.noLowStock")}</div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="w-[38%] px-4 py-3 text-left font-semibold">{t("products.name")}</th>
                    <th className="w-[20%] px-4 py-3 text-left font-semibold">SKU</th>
                    <th className="w-[18%] px-4 py-3 text-left font-semibold">{t("products.category")}</th>
                    <th className="w-[12%] px-4 py-3 text-right font-semibold">{t("products.stock")}</th>
                    <th className="w-[12%] px-4 py-3 text-right font-semibold">{t("products.price")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map((product) => (
                    <tr key={product.id} className="border-t">
                      <td className="px-4 py-3">
                        <div className="truncate font-medium" title={product.name}>
                          {product.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="truncate block" title={product.sku}>
                          {product.sku}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="truncate block" title={product.category?.name || ""}>
                          {product.category?.name || t("common.notAvailable")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-destructive">{getStockLabel(product)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(product.salePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
