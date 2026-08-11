import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://localhost:5000/api";
const scenarios = [7, 15, 30];

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@homex.com", password: "123456" }),
  });
  if (!loginResponse.ok) throw new Error(`Login failed: ${loginResponse.status}`);
  const loginJson: any = await loginResponse.json();
  const token = loginJson.data?.token || loginJson.token;
  if (!token) throw new Error("Login response has no token");

  const results: any[] = [];
  for (const days of scenarios) {
    const response = await fetch(`${baseUrl}/inventory/ai-forecast?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Forecast ${days} failed: ${response.status} ${await response.text()}`);
    const json: any = await response.json();
    const list = json.data?.restockList || [];
    const skus = list.map((item: any) => item.sku);
    const checks = {
      responseSuccess: json.success === true,
      noDuplicateSku: new Set(skus).size === skus.length,
      allQuantitiesNonNegative: list.every((item: any) => Number.isInteger(item.suggestedRestockQuantity) && item.suggestedRestockQuantity >= 0),
      noSalesRule: list.every((item: any) => {
        if (item.soldLast7Days !== 0 || item.soldLast30Days !== 0) return true;
        const expectedQuantity = Math.max(0, item.minimumStock - item.currentStock);
        const expectedPriority = item.currentStock < item.minimumStock ? "MEDIUM" : "LOW";
        return item.suggestedRestockQuantity === expectedQuantity
          && item.priority === expectedPriority
          && item.confidence === "LOW";
      }),
      allProductIdsValid: list.every((item: any) => Number.isInteger(item.productId) && item.productId > 0),
      maxTwelve: list.length <= 12,
      validRecommendationType: list.every((item: any) => ["LOW_STOCK", "RISING_TREND", "SEASONAL_HOT", "SEASONAL_WATCH", "NO_SIGNAL", "CATEGORY_MOMENTUM"].includes(item.recommendationType)),
    };
    results.push({ days, itemCount: list.length, stats: json.data?.stats, checks, restockList: list });
    console.log(`${days} days: items=${list.length} passed=${Object.values(checks).every(Boolean)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const allChecks = results.flatMap((item) => Object.values(item.checks));
  const summary = {
    scenarioCount: results.length,
    invariantCount: allChecks.length,
    invariantPassRate: allChecks.filter(Boolean).length / allChecks.length,
    evaluatedAt: new Date().toISOString(),
  };
  const outDir = path.resolve(process.cwd(), "..", "docs", "benchmarks");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "inventory-ai-benchmark.json"), JSON.stringify({ summary, results }, null, 2), "utf8");
  console.log(JSON.stringify(summary));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
