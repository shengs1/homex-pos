import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { salesAssistantService } from "../src/services/sales-assistant.service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
process.env.GEMINI_API_KEY = "";
process.env.GROQ_API_KEY = "";

const prisma = new PrismaClient();
const scenarios = [
  { need: "nồi cơm", budgetMin: 0, budgetMax: 10000 },
  { need: "máy xay", budgetMin: 0, budgetMax: 10000 },
  { need: "máy hút bụi", budgetMin: 0, budgetMax: 10000 },
  { need: "tủ lạnh", budgetMin: 0, budgetMax: 10000 },
  { need: "dụng cụ nấu ăn", budgetMin: 0, budgetMax: 10000 },
  { need: "đồ phòng tắm", budgetMin: 0, budgetMax: 10000 },
  { need: "ổ cắm", budgetMin: 0, budgetMax: 10000 },
  { need: "sản phẩm không tồn tại xyz", budgetMin: 0, budgetMax: 10000 },
];

async function main() {
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", stockQuantity: { gt: 0 } },
    select: { id: true, salePrice: true, stockQuantity: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const results = [];

  for (const scenario of scenarios) {
    const response = await salesAssistantService.getSuggestions(scenario);
    const ids = response.recommendations.map((item) => item.productId);
    const checks = {
      sourceIsHeuristic: response.source === "HEURISTIC" && response.provider === undefined,
      allIdsValid: ids.every((id) => productMap.has(id)),
      allInStock: ids.every((id) => Number(productMap.get(id)?.stockQuantity || 0) > 0),
      allWithinBudget: response.recommendations.every((item) => item.price >= scenario.budgetMin && item.price <= scenario.budgetMax),
      noDuplicate: new Set(ids).size === ids.length,
      maxFive: ids.length <= 5,
      unknownNeedReturnsEmpty: scenario.need !== "sản phẩm không tồn tại xyz" || ids.length === 0,
    };
    results.push({ scenario, recommendationCount: ids.length, checks });
  }

  const allChecks = results.flatMap((item) => Object.values(item.checks));
  const summary = {
    scenarioCount: results.length,
    invariantCount: allChecks.length,
    passedCount: allChecks.filter(Boolean).length,
    passRate: allChecks.filter(Boolean).length / allChecks.length,
    evaluatedAt: new Date().toISOString(),
    mode: "HEURISTIC_ONLY_NO_EXTERNAL_DATA",
  };

  const outDir = path.resolve(process.cwd(), "..", "docs", "benchmarks");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "sales-ai-current-benchmark.json"),
    JSON.stringify({ summary, results }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.passedCount !== summary.invariantCount) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
