"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { RoleGuard } from "@/components/auth/role-guard";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { compactMoneyDisplayValue, formatNumber } from "@/lib/format";
import { reportService } from "@/services/homex.service";
import type { ProfitReportItem, ReportSummary, TopProductReportItem } from "@/types/domain";

function MeasuredChartFrame({ children }: { children: (width: number, height: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const height = 270;

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
    <div ref={ref} className="h-[270px] min-h-[270px] w-full min-w-[1px] px-6">
      {width > 0 ? children(width, height) : null}
    </div>
  );
}
function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 29); // 30 days including today
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

function formatCurrencyNumber(value: number | string | null | undefined) {
  const numberValue = compactMoneyDisplayValue(value);
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(numberValue);
}

function formatYAxisShort(value: number) {
  value = compactMoneyDisplayValue(value);
  if (value === 0) return "0 VND";
  if (value >= 1000000) return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1).replace('.', ',') + "M VND";
  if (value >= 1000) return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1).replace('.', ',') + "K VND";
  return value.toString() + " VND";
}

function formatXAxisShort(value: string) {
  if (!value) return "";
  const match = value.match(/\d{4}-(\d{2})-(\d{2})/);
  if (match) return `${match[2]}/${match[1]}`;
  return value;
}

function CurrencyDisplay({ value, className = "", unitClass = "text-xs text-slate-400 ml-1 font-medium" }: { value: number, className?: string, unitClass?: string }) {
  return (
    <span className={className}>
      {formatCurrencyNumber(value)}
      <span className={unitClass}>VND</span>
    </span>
  );
}

function MetricCard({ title, value, description, colorClass = "text-slate-800" }: { title: string; value: React.ReactNode; description?: string; colorClass?: string }) {
  return (
    <Card className="min-w-0 rounded-2xl border-slate-100 shadow-sm bg-white hover:shadow-md transition-shadow">
      <CardContent className="p-5 flex flex-col justify-center h-full">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</p>
        <div className={`text-2xl sm:text-3xl font-black ${colorClass} truncate`} title={typeof value === 'string' ? value : undefined}>
          {value}
        </div>
        {description && <p className="mt-2 text-xs font-medium text-slate-500">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { t, language } = useLanguage();
  const initialDateRange = defaultDateRange();
  const [fromDate, setFromDate] = useState(initialDateRange.fromDate);
  const [toDate, setToDate] = useState(initialDateRange.toDate);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [profitItems, setProfitItems] = useState<ProfitReportItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadReports() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const params = { fromDate, toDate, limit: 10 };
      const [summaryData, profitData, topProductData] = await Promise.all([
        reportService.summary(params),
        reportService.profit({ ...params, groupBy: "day" }),
        reportService.topProducts(params),
      ]);

      setSummary(summaryData);
      setProfitItems(profitData.items || []);
      setTopProducts(topProductData.items || []);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [fromDate, toDate]);

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
    productId: item.productId,
    name: item.product?.name || t("reports.unknownProduct"),
    quantity: Number(item.totalQuantity || 0),
    revenue: Number(item.totalRevenue || 0),
  }));

  const hasProfitChartData = profitChartData.some((item) => item.revenue > 0 || item.cogs > 0 || item.netProfit !== 0);
  
  const daysDiff = Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 3600 * 24)) + 1;
  const is7Days = daysDiff === 7;
  const is30Days = daysDiff === 30;
  
  let rangeLabel = `${formatXAxisShort(fromDate)} - ${formatXAxisShort(toDate)}`;
  let topSubtitle = "";
  if (is7Days) {
    rangeLabel = t("reports.last7DaysFull");
    topSubtitle = t("reports.topSellingSubtitle7Days");
  } else if (is30Days) {
    rangeLabel = t("reports.last30DaysFull");
    topSubtitle = t("reports.topSellingSubtitle30Days");
  } else {
    topSubtitle = t("reports.customRangeSubtitle", { from: formatXAxisShort(fromDate), to: formatXAxisShort(toDate) });
  }

  const maxQuantity = topProductChartData.length > 0 ? Math.max(...topProductChartData.map(d => d.quantity)) : 1;

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="w-full min-w-0 space-y-6 pb-10 bg-slate-50/30">
        
        {/* Header & Filter Card */}
        <div className="flex flex-col gap-4 items-start">
          <PageHeader title={t("reports.businessProfit")} description={t("reports.businessProfitDescription")} />
          
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm w-full lg:w-auto">
            <div className="flex gap-2">
              <Button type="button" variant={is30Days ? "default" : "outline"} size="sm" className="h-9 px-4 rounded-xl text-xs font-semibold" onClick={() => {
                const to = new Date();
                const from = new Date(to);
                from.setDate(to.getDate() - 29);
                setFromDate(toLocalIsoDate(from));
                setToDate(toLocalIsoDate(to));
              }}>
                {t("reports.last30Days")}
              </Button>
              <Button type="button" variant={is7Days ? "default" : "outline"} size="sm" className="h-9 px-4 rounded-xl text-xs font-semibold" onClick={() => {
                const to = new Date();
                const from = new Date(to);
                from.setDate(to.getDate() - 6);
                setFromDate(toLocalIsoDate(from));
                setToDate(toLocalIsoDate(to));
              }}>
                {t("reports.last7Days")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 ml-2">{t("reports.fromDateShort")}</span>
              <DateFilterInput label="" value={fromDate} onChange={setFromDate} className="w-35 shadow-none h-9 text-sm" />
              <span className="text-xs font-semibold text-slate-400">{t("reports.toDateShort")}</span>
              <DateFilterInput label="" value={toDate} onChange={setToDate} className="w-35 shadow-none h-9 text-sm" />
            </div>
          </div>
        </div>

        <ErrorState message={errorMessage} />
        {isLoading && !summary ? <LoadingState /> : null}

        {summary ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
            <MetricCard title={t("reports.revenue")} value={<CurrencyDisplay value={profitTotals.revenue || summary.netRevenue} />} description={t("reports.revenueRangeDesc")} colorClass="text-[#4F46E5]" />
            <MetricCard title={t("reports.cogs")} value={<CurrencyDisplay value={profitTotals.cogs} />} description={t("reports.cogsDesc")} colorClass="text-[#475569]" />
            <MetricCard title={t("reports.netProfit")} value={<CurrencyDisplay value={profitTotals.netProfit} />} description={t("reports.netProfitRangeDesc")} colorClass="text-[#059669]" />
            <MetricCard title={t("reports.totalOrders")} value={formatNumber(summary.completedOrders)} description={t("reports.completedOrdersDesc")} colorClass="text-[#1E293B]" />
          </div>
        ) : null}

        <div className="grid w-full min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(380px,1fr)] items-start">
          
          {/* Main Profit Chart */}
          <Card className="min-w-0 rounded-2xl border-slate-100 shadow-sm bg-white flex h-[400px] flex-col">
            <CardHeader className="pb-2 pt-6 px-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <CardTitle className="text-lg font-black text-slate-800">{t("reports.financialTrend")}</CardTitle>
                  <p className="text-xs font-medium text-slate-500 mt-1">{t("reports.financialTrendDescription")}</p>
                </div>
                <Badge variant="secondary" className="font-bold shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-200 border-none">{rangeLabel}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-5 mt-6 text-[11px] font-bold text-slate-600">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#2563EB]"></span> {t("reports.revenue")}</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#64748B]"></span> {t("reports.cogs")}</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#10B981]"></span> {t("reports.netProfit")}</div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pb-4 px-0 relative">
              {hasProfitChartData ? (
                <MeasuredChartFrame>
                  {(width, height) => (
                    <AreaChart width={width} height={height} data={profitChartData} margin={{ top: 16, right: 30, left: 0, bottom: 28 }}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCogs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#64748B" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#64748B" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="period" 
                        tick={{ fontSize: 11, fontWeight: 600, fill: "#94a3b8" }} 
                        tickFormatter={formatXAxisShort} 
                        minTickGap={30}
                        axisLine={false}
                        tickLine={false}
                        height={36}
                        tickMargin={10}
                        padding={{ left: 15, right: 15 }}
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fontWeight: 600, fill: "#94a3b8" }} 
                        tickFormatter={formatYAxisShort} 
                        width={80}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={8}
                      />
                      <Tooltip 
                        formatter={(value: any, name: any) => [`${formatCurrencyNumber(Number(value))} VND`, name]} 
                        labelFormatter={(label) => {
                          const date = new Date(label);
                          if(!isNaN(date.getTime())) {
                            return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                          }
                          return label;
                        }}
                        contentStyle={{ borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', fontWeight: 600, fontSize: '13px', padding: '12px 16px' }}
                        itemStyle={{ padding: '4px 0' }}
                      />
                      <Area type="monotone" dataKey="revenue" name={t("reports.revenue")} stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: "#2563EB" }} />
                      <Area type="monotone" dataKey="cogs" name={t("reports.cogs")} stroke="#64748B" strokeWidth={3} fillOpacity={1} fill="url(#colorCogs)" dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: "#64748B" }} />
                      <Area type="monotone" dataKey="netProfit" name={t("reports.netProfit")} stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: "#10B981" }} />
                    </AreaChart>
                  )}
                </MeasuredChartFrame>
              ) : (
                <div className="mx-6 flex h-[270px] min-h-[270px] items-center justify-center rounded-xl border border-dashed border-slate-200">
                  <EmptyState message={t("reports.noProfitData")} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Products Ranking */}
          <Card className="min-w-0 rounded-2xl border-slate-100 shadow-sm bg-white flex h-[400px] flex-col">
            <CardHeader className="pb-3 pt-6 px-6 border-b border-slate-50 flex-none">
              <CardTitle className="text-base font-black uppercase text-slate-800 tracking-wide">{t("reports.topSellingProducts")}</CardTitle>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                {topSubtitle}
              </p>
            </CardHeader>
            <CardContent className="p-0 flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-2 py-3 custom-scrollbar">
                {topProductChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-8 text-center text-xs font-medium text-slate-400">
                    {t("reports.noTopProducts")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {topProductChartData.map((item, index) => {
                      const percent = Math.min(100, Math.max(0, (item.quantity / maxQuantity) * 100));
                      const isTop1 = index === 0;
                      const isTop2 = index === 1;
                      const isTop3 = index === 2;
                      let badgeClass = "bg-slate-100 text-slate-500";
                      let barClass = "bg-slate-200";
                      
                      if (isTop1) { badgeClass = "bg-amber-100 text-amber-600"; barClass = "bg-amber-400"; }
                      else if (isTop2) { badgeClass = "bg-emerald-100 text-emerald-600"; barClass = "bg-emerald-400"; }
                      else if (isTop3) { badgeClass = "bg-blue-100 text-blue-600"; barClass = "bg-blue-400"; }

                      return (
                        <div key={item.productId || index} className="px-4 py-2 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`flex shrink-0 items-center justify-center h-7 w-7 rounded-lg text-[11px] font-black ${badgeClass}`}>
                                #{index + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-bold text-slate-800" title={item.name}>{item.name}</p>
                                <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                                  {t("reports.productRevenue").replace("{amount}", "")} <CurrencyDisplay value={item.revenue} className="text-slate-600 font-bold" unitClass="text-[10px] text-slate-400 font-normal ml-0.5" />
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0 text-right mt-0.5">
                              <p className="text-[11px] font-black text-slate-700">{t("reports.soldItems").replace("{count}", formatNumber(item.quantity))}</p>
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ease-out ${barClass}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </RoleGuard>
  );
}

