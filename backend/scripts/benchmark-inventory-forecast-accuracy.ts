import fs from "node:fs";
import path from "node:path";
import prisma from "../src/lib/prisma";

type ProductSpec = {
  id: number;
  sku: string;
  name: string;
  category: string;
  scenario: string;
};

type Dataset = {
  name: string;
  startDate: Date;
  totalDays: number;
  products: ProductSpec[];
  sales: Map<string, number>;
  promotions: Set<string>;
  metadata: Record<string, unknown>;
};

type Observation = {
  productId: number;
  sku: string;
  scenario: string;
  cutoffDay: number;
  actual: number;
  forecastHeuristic: number;
  forecastBaseline7: number;
  forecastBaseline30: number;
  coldStart: boolean;
  lowHistory: boolean;
  promotionWindow: boolean;
  seasonalWindow: boolean;
};

const DAY_MS = 86_400_000;
const outputPath = path.resolve(__dirname, "../../docs/benchmarks/inventory-forecast-accuracy.json");

function dayKey(productId: number, day: number) {
  return `${productId}:${day}`;
}

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function differenceDays(date: Date, start: Date) {
  return Math.floor((utcDay(date).getTime() - utcDay(start).getTime()) / DAY_MS);
}

function sumProduct(dataset: Dataset, productId: number, start: number, end: number) {
  let total = 0;
  for (let day = Math.max(0, start); day < Math.min(dataset.totalDays, end); day += 1) {
    total += dataset.sales.get(dayKey(productId, day)) || 0;
  }
  return total;
}

function sumCategory(dataset: Dataset, category: string, start: number, end: number) {
  return dataset.products
    .filter((product) => product.category === category)
    .reduce((total, product) => total + sumProduct(dataset, product.id, start, end), 0);
}

function getSeasonBoost(category: string, date: Date) {
  const month = date.getUTCMonth() + 1;
  const normalized = category.toLowerCase();
  if ([4, 5, 6, 7, 8].includes(month)) {
    if (normalized.includes("làm sạch")) return 1.1;
    if (normalized.includes("nhà bếp")) return 1.25;
  }
  if ([11, 12, 1, 2].includes(month)) {
    if (normalized.includes("nhà bếp")) return 1.3;
    if (normalized.includes("gia đình")) return 1.2;
    if (normalized.includes("làm sạch")) return 1.35;
  }
  return 1;
}

function predict(dataset: Dataset, product: ProductSpec, cutoffDay: number, horizon: number) {
  const sold30 = sumProduct(dataset, product.id, cutoffDay - 30, cutoffDay);
  const sold7 = sumProduct(dataset, product.id, cutoffDay - 7, cutoffDay);
  const avg30 = sold30 / 30;
  const avg7 = sold7 / 7;
  const trendRatio = avg30 > 0 ? avg7 / avg30 : sold7 > 0 ? 2 : 1;

  const categorySold30 = sumCategory(dataset, product.category, cutoffDay - 30, cutoffDay);
  const categorySold7 = sumCategory(dataset, product.category, cutoffDay - 7, cutoffDay);
  const categoryAvg30 = categorySold30 / 30;
  const categoryAvg7 = categorySold7 / 7;
  const categoryTrendRatio = categoryAvg30 > 0 ? categoryAvg7 / categoryAvg30 : 1;
  const seasonBoost = getSeasonBoost(product.category, addDays(dataset.startDate, cutoffDay));

  const forecastHeuristic = sold7 === 0 && sold30 === 0
    ? 0
    : avg30 * trendRatio * categoryTrendRatio * seasonBoost * horizon;

  return {
    forecastHeuristic,
    forecastBaseline7: avg7 * horizon,
    forecastBaseline30: avg30 * horizon,
    seasonBoost,
    sold30,
  };
}

function buildObservations(dataset: Dataset, minTrainingDays: number, horizon: number, step: number) {
  const observations: Observation[] = [];
  for (let cutoffDay = minTrainingDays; cutoffDay + horizon <= dataset.totalDays; cutoffDay += step) {
    for (const product of dataset.products) {
      const prediction = predict(dataset, product, cutoffDay, horizon);
      const actual = sumProduct(dataset, product.id, cutoffDay, cutoffDay + horizon);
      const historyUnits = sumProduct(dataset, product.id, 0, cutoffDay);
      let promotionWindow = false;
      for (let day = cutoffDay; day < cutoffDay + horizon; day += 1) {
        if (dataset.promotions.has(dayKey(product.id, day))) promotionWindow = true;
      }
      observations.push({
        productId: product.id,
        sku: product.sku,
        scenario: product.scenario,
        cutoffDay,
        actual,
        forecastHeuristic: prediction.forecastHeuristic,
        forecastBaseline7: prediction.forecastBaseline7,
        forecastBaseline30: prediction.forecastBaseline30,
        coldStart: historyUnits === 0,
        lowHistory: prediction.sold30 < 5,
        promotionWindow,
        seasonalWindow: prediction.seasonBoost > 1,
      });
    }
  }
  return observations;
}

function round(value: number, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function metricSet(observations: Observation[], forecastField: "forecastHeuristic" | "forecastBaseline7" | "forecastBaseline30") {
  if (!observations.length) return null;
  const errors = observations.map((observation) => observation[forecastField] - observation.actual);
  const absoluteErrors = errors.map(Math.abs);
  const squaredErrors = errors.map((error) => error * error);
  const nonZero = observations.filter((observation) => observation.actual > 0);
  const actualTotal = observations.reduce((total, observation) => total + observation.actual, 0);
  const forecastTotal = observations.reduce((total, observation) => total + observation[forecastField], 0);
  return {
    n: observations.length,
    nonZeroActualN: nonZero.length,
    zeroActualRate: round((observations.length - nonZero.length) / observations.length),
    actualTotal: round(actualTotal),
    forecastTotal: round(forecastTotal),
    mae: round(absoluteErrors.reduce((a, b) => a + b, 0) / observations.length),
    rmse: round(Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / observations.length)),
    wapePercent: actualTotal > 0 ? round(absoluteErrors.reduce((a, b) => a + b, 0) / actualTotal * 100) : null,
    mapeNonZeroPercent: nonZero.length
      ? round(nonZero.reduce((total, observation) => total + Math.abs(observation[forecastField] - observation.actual) / observation.actual, 0) / nonZero.length * 100)
      : null,
    meanErrorBias: round(errors.reduce((a, b) => a + b, 0) / observations.length),
  };
}

function summarize(observations: Observation[]) {
  const models = {
    heuristic: metricSet(observations, "forecastHeuristic"),
    baseline7DayMean: metricSet(observations, "forecastBaseline7"),
    baseline30DayMean: metricSet(observations, "forecastBaseline30"),
  };
  const slices: Record<string, Observation[]> = {
    promotionWindows: observations.filter((observation) => observation.promotionWindow),
    nonPromotionWindows: observations.filter((observation) => !observation.promotionWindow),
    seasonalWindows: observations.filter((observation) => observation.seasonalWindow),
    coldStart: observations.filter((observation) => observation.coldStart),
    lowHistory: observations.filter((observation) => observation.lowHistory),
  };
  return {
    models,
    slices: Object.fromEntries(Object.entries(slices).map(([key, value]) => [key, {
      observationCount: value.length,
      heuristic: metricSet(value, "forecastHeuristic"),
      baseline7DayMean: metricSet(value, "forecastBaseline7"),
    }])),
    byScenario: Object.fromEntries([...new Set(observations.map((observation) => observation.scenario))].map((scenario) => {
      const values = observations.filter((observation) => observation.scenario === scenario);
      return [scenario, {
        observationCount: values.length,
        heuristic: metricSet(values, "forecastHeuristic"),
        baseline7DayMean: metricSet(values, "forecastBaseline7"),
        baseline30DayMean: metricSet(values, "forecastBaseline30"),
      }];
    })),
  };
}

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function poisson(lambda: number, random: () => number) {
  const limit = Math.exp(-Math.max(0, lambda));
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > limit && count < 100);
  return Math.max(0, count - 1);
}

function buildSyntheticDataset() {
  const random = makeRng(23052084);
  const startDate = new Date(Date.UTC(2026, 0, 1));
  const totalDays = 180;
  const products: ProductSpec[] = [
    { id: 1001, sku: "SYN-STEADY", name: "Nhu cầu ổn định", category: "Thiết bị nhà bếp", scenario: "steady" },
    { id: 1002, sku: "SYN-RISING", name: "Nhu cầu tăng dần", category: "Thiết bị nhà bếp", scenario: "rising" },
    { id: 1003, sku: "SYN-SEASON", name: "Nhu cầu mùa nóng", category: "Thiết bị nhà bếp", scenario: "seasonal" },
    { id: 1004, sku: "SYN-PROMO", name: "Sản phẩm có khuyến mãi", category: "Thiết bị làm sạch", scenario: "promotion" },
    { id: 1005, sku: "SYN-INTERMITTENT", name: "Bán ngắt quãng", category: "Đồ dùng gia đình", scenario: "intermittent" },
    { id: 1006, sku: "SYN-NEW", name: "Sản phẩm mới", category: "Thiết bị điện", scenario: "newProduct" },
    { id: 1007, sku: "SYN-DECLINING", name: "Nhu cầu giảm", category: "Thiết bị làm sạch", scenario: "declining" },
    { id: 1008, sku: "SYN-COLD", name: "Cold-start muộn", category: "Đồ dùng gia đình", scenario: "coldStart" },
  ];
  const sales = new Map<string, number>();
  const promotions = new Set<string>();

  for (let day = 0; day < totalDays; day += 1) {
    const date = addDays(startDate, day);
    const month = date.getUTCMonth() + 1;
    for (const product of products) {
      let lambda = 0;
      let promoted = false;
      switch (product.scenario) {
        case "steady":
          lambda = 2.2;
          break;
        case "rising":
          lambda = 0.5 + day * 0.018;
          break;
        case "seasonal":
          lambda = [4, 5, 6, 7, 8].includes(month) ? 4.2 : 1.2;
          break;
        case "promotion":
          promoted = (day >= 70 && day <= 83) || (day >= 140 && day <= 153);
          lambda = promoted ? 5.5 : 1.3;
          break;
        case "intermittent":
          lambda = random() < 0.18 ? 2.5 : 0;
          break;
        case "newProduct":
          lambda = day >= 120 ? 1.8 : 0;
          break;
        case "declining":
          lambda = Math.max(0.25, 3.8 - day * 0.018);
          break;
        case "coldStart":
          lambda = day >= 165 ? 2.8 : 0;
          break;
      }
      const quantity = lambda > 0 ? poisson(lambda, random) : 0;
      if (quantity > 0) sales.set(dayKey(product.id, day), quantity);
      if (promoted) promotions.add(dayKey(product.id, day));
    }
  }

  return {
    name: "controlledSynthetic180Days",
    startDate,
    totalDays,
    products,
    sales,
    promotions,
    metadata: {
      generated: true,
      seed: 23052084,
      purpose: "Kiểm tra hành vi thuật toán trong các chế độ nhu cầu; không đại diện độ chính xác tại cửa hàng thật.",
      scenarios: products.map(({ sku, scenario }) => ({ sku, scenario })),
      promotionWindows: ["day 70-83", "day 140-153"],
    },
  } satisfies Dataset;
}

async function buildDemoDataset() {
  const rows = await prisma.orderDetail.findMany({
    where: {
      order: {
        OR: [{ status: "COMPLETED" }, { payment: { status: "PAID" } }],
        NOT: [{ status: "CANCELLED" }, { payment: { status: "REFUNDED" } }],
      },
    },
    select: {
      productId: true,
      quantity: true,
      createdAt: true,
      product: { select: { sku: true, name: true, category: { select: { name: true } } } },
      order: { select: { id: true, promotionCode: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) throw new Error("Không có dữ liệu bán hàng đủ điều kiện để backtest.");

  const startDate = utcDay(rows[0].createdAt);
  const lastDate = utcDay(rows[rows.length - 1].createdAt);
  const totalDays = differenceDays(lastDate, startDate) + 1;
  const productMap = new Map<number, ProductSpec>();
  const sales = new Map<string, number>();
  const promotions = new Set<string>();
  const orderIds = new Set<number>();

  for (const row of rows) {
    const day = differenceDays(row.createdAt, startDate);
    productMap.set(row.productId, {
      id: row.productId,
      sku: row.product.sku,
      name: row.product.name,
      category: row.product.category.name,
      scenario: "observedDemo",
    });
    const key = dayKey(row.productId, day);
    sales.set(key, (sales.get(key) || 0) + row.quantity);
    orderIds.add(row.order.id);
    if (row.order.promotionCode) promotions.add(key);
  }

  return {
    name: "observedDemoDatabase",
    startDate,
    totalDays,
    products: [...productMap.values()],
    sales,
    promotions,
    metadata: {
      generated: false,
      eligibleOrderCount: orderIds.size,
      orderDetailCount: rows.length,
      totalUnits: rows.reduce((total, row) => total + row.quantity, 0),
      distinctProductsSold: productMap.size,
      distinctSaleDays: new Set(rows.map((row) => utcDay(row.createdAt).toISOString().slice(0, 10))).size,
      ordersWithPromotion: new Set(rows.filter((row) => row.order.promotionCode).map((row) => row.order.id)).size,
      firstSaleDate: startDate.toISOString().slice(0, 10),
      lastSaleDate: lastDate.toISOString().slice(0, 10),
      limitation: "Dữ liệu rất thưa; chỉ dùng đánh giá thăm dò, không dùng để khẳng định khả năng tổng quát.",
    },
  } satisfies Dataset;
}

async function main() {
  const demoDataset = await buildDemoDataset();
  const syntheticDataset = buildSyntheticDataset();
  const demoObservations = buildObservations(demoDataset, 7, 1, 1);
  const syntheticObservations = buildObservations(syntheticDataset, 30, 7, 7);

  const result = {
    evaluatedAt: new Date().toISOString(),
    method: {
      name: "Rule-based demand estimator with optional LLM explanation",
      trainedModel: false,
      historyWindows: [7, 30],
      formula: "avg30 × (avg7/avg30) × categoryTrendRatio × seasonRuleBoost",
      llmRole: "Chỉ diễn giải/phân loại sau khi công thức đã tính; không tạo dự báo gốc.",
      baselines: ["7-day moving mean", "30-day moving mean"],
      metrics: ["MAE", "RMSE", "WAPE", "MAPE on actual > 0", "mean error bias"],
    },
    observedDemo: {
      dataset: demoDataset.metadata,
      evaluation: { minTrainingDays: 7, horizonDays: 1, stepDays: 1, observationCount: demoObservations.length },
      results: summarize(demoObservations),
      interpretation: "Exploratory only because the holdout contains very few non-zero demand observations.",
    },
    controlledSynthetic: {
      dataset: syntheticDataset.metadata,
      evaluation: { totalDays: 180, minTrainingDays: 30, horizonDays: 7, stepDays: 7, observationCount: syntheticObservations.length },
      results: summarize(syntheticObservations),
      interpretation: "Controlled engineering test, not evidence of real-store forecast accuracy.",
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({
    outputPath,
    observed: result.observedDemo,
    syntheticOverall: result.controlledSynthetic.results.models,
    syntheticPromotionSlice: result.controlledSynthetic.results.slices.promotionWindows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
