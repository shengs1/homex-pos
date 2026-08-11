import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { salesAssistantService } from "../src/services/sales-assistant.service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const prisma = new PrismaClient();
const scenarios = [
  { need: "nồi cơm cho gia đình", budgetMin: 0, budgetMax: 2000 },
  { need: "máy xay sinh tố", budgetMin: 0, budgetMax: 1500 },
  { need: "máy hút bụi", budgetMin: 0, budgetMax: 2500 },
  { need: "thiết bị làm mát", budgetMin: 0, budgetMax: 3000 },
  { need: "dụng cụ nấu ăn", budgetMin: 0, budgetMax: 2000 },
  { need: "sản phẩm có bảo hành", budgetMin: 500, budgetMax: 4000, preferences: { preferWarranty: true } },
  { need: "sản phẩm đang khuyến mãi", budgetMin: 0, budgetMax: 5000, preferences: { preferPromotion: true } },
  { need: "mua kèm đồ nhà bếp", budgetMin: 0, budgetMax: 2500, preferences: { crossSellFromCart: true } },
];

async function main() {
  const products = await prisma.product.findMany({ where: { status: "ACTIVE", stockQuantity: { gt: 0 } } });
  const validById = new Map(products.map((product) => [product.id, product]));
  const results: any[] = [];

  for (const scenario of scenarios) {
    const response = await salesAssistantService.getSuggestions(scenario);
    const ids = response.recommendations.map((item) => item.productId);
    const allIdsValid = ids.every((id) => validById.has(id));
    const allInStock = ids.every((id) => (validById.get(id)?.stockQuantity || 0) > 0);
    const allWithinBudget = response.recommendations.every((item) =>
      item.price >= scenario.budgetMin && item.price <= scenario.budgetMax
    );
    const noDuplicate = new Set(ids).size === ids.length;
    const maxFive = ids.length <= 5;
    results.push({ scenario, source: response.source, recommendationCount: ids.length, allIdsValid, allInStock, allWithinBudget, noDuplicate, maxFive, recommendations: response.recommendations });
    console.log(`${scenario.need}: source=${response.source} count=${ids.length} constraints=${allIdsValid && allInStock && allWithinBudget && noDuplicate && maxFive}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const savedGeminiKey = process.env.GEMINI_API_KEY;
  const savedGroqKey = process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  const fallbackResponse = await salesAssistantService.getSuggestions({ need: "nồi cơm", budgetMin: 0, budgetMax: 2000 });
  if (savedGeminiKey) process.env.GEMINI_API_KEY = savedGeminiKey;
  if (savedGroqKey) process.env.GROQ_API_KEY = savedGroqKey;
  const fallbackValid = fallbackResponse.source === "HEURISTIC" && fallbackResponse.recommendations.every((item) => validById.has(item.productId) && item.stockQuantity > 0 && item.price <= 2000);

  const passed = results.filter((item) => item.allIdsValid && item.allInStock && item.allWithinBudget && item.noDuplicate && item.maxFive).length;
  const summary = {
    scenarioCount: results.length,
    constraintPassRate: passed / results.length,
    aiResponseCount: results.filter((item) => item.source === "AI").length,
    heuristicResponseCount: results.filter((item) => item.source === "HEURISTIC").length,
    fallbackValid,
    evaluatedAt: new Date().toISOString(),
  };
  const outDir = path.resolve(process.cwd(), "..", "docs", "benchmarks");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "sales-ai-benchmark.json"), JSON.stringify({ summary, results, fallback: fallbackResponse }, null, 2), "utf8");
  console.log(JSON.stringify(summary));
}

main().finally(async () => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
