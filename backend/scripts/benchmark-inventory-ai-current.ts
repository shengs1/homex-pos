import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { inventoryAiService } from "../src/services/inventory-ai.service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Benchmark này cố ý tắt các khóa AI để kiểm tra riêng công thức dự phòng.
process.env.GEMINI_API_KEY = "";
process.env.GROQ_API_KEY = "";

const scenarios = [7, 15, 30];

async function main() {
  const results = [];

  for (const days of scenarios) {
    const data = await inventoryAiService.forecast(days);
    const list = data.restockList;
    const skus = list.map((item) => item.sku);
    const checks = {
      sourceIsFormula: data.source === "FORMULA" && data.provider === undefined,
      noDuplicateSku: new Set(skus).size === skus.length,
      allQuantitiesNonNegative: list.every((item) => Number.isInteger(item.suggestedRestockQuantity) && item.suggestedRestockQuantity >= 0),
      noSalesRule: list.every((item) => {
        if (item.soldLast7Days !== 0 || item.soldLast30Days !== 0) return true;
        const expectedQuantity = Math.max(0, item.minimumStock - item.currentStock);
        const expectedPriority = item.currentStock < item.minimumStock ? "MEDIUM" : "LOW";
        return item.suggestedRestockQuantity === expectedQuantity
          && item.priority === expectedPriority
          && item.confidence === "LOW";
      }),
      allSkusValid: list.every((item) => typeof item.sku === "string" && item.sku.trim().length > 0),
      maxTwelve: list.length <= 12,
      validRecommendationType: list.every((item) => [
        "LOW_STOCK",
        "RISING_TREND",
        "SEASONAL_HOT",
        "SEASONAL_WATCH",
        "NO_SIGNAL",
        "CATEGORY_MOMENTUM",
      ].includes(item.recommendationType)),
      statsAreNonNegative: Object.values(data.stats).every((value) => Number(value) >= 0),
    };

    results.push({ days, itemCount: list.length, stats: data.stats, checks });
  }

  const allChecks = results.flatMap((item) => Object.values(item.checks));
  const summary = {
    scenarioCount: results.length,
    invariantCount: allChecks.length,
    passedCount: allChecks.filter(Boolean).length,
    invariantPassRate: allChecks.filter(Boolean).length / allChecks.length,
    evaluatedAt: new Date().toISOString(),
    mode: "FORMULA_ONLY_NO_EXTERNAL_DATA",
  };

  const outDir = path.resolve(process.cwd(), "..", "docs", "benchmarks");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "inventory-ai-current-benchmark.json"),
    JSON.stringify({ summary, results }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));

  if (summary.passedCount !== summary.invariantCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
