import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createAiClient, getConfiguredAiProviders } from "../src/services/ai-provider.service";

const here = __dirname;
const backendRoot = path.resolve(here, "..");
const repoRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

const samples = [
  ["rice-cooker.jpg", ["noi com", "rice cooker"], "Thiết bị nhà bếp"],
  ["blender.jpg", ["may xay", "blender"], "Thiết bị nhà bếp"],
  ["vacuum-cleaner.jpg", ["may hut bui", "vacuum"], "Thiết bị làm sạch"],
  ["air-fryer.jpg", ["noi chien", "air fryer"], "Thiết bị nhà bếp"],
  ["electric-kettle.jpg", ["am dien", "kettle"], "Thiết bị nhà bếp"],
  ["induction-cooker.jpg", ["bep tu", "induction"], "Thiết bị nhà bếp"],
  ["hair-dryer.jpg", ["may say", "hair dryer"], "Thiết bị điện"],
  ["standing-fan.jpg", ["quat", "fan"], "Thiết bị làm mát"],
  ["steam-iron.jpg", ["ban ui", "ban la", "iron"], "Thiết bị điện"],
  ["nonstick-pan.jpg", ["chao", "pan"], "Dụng cụ nấu ăn"],
  ["trash-bin.jpg", ["thung rac", "trash bin", "waste bin"], "Đồ dùng gia đình"],
  ["storage-shelf.jpg", ["ke", "shelf", "rack"], "Đồ dùng gia đình"],
] as const;

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const provider = getConfiguredAiProviders()[0];
if (!provider) throw new Error("Chưa cấu hình GEMINI_API_KEY hoặc GROQ_API_KEY");
const client = createAiClient(provider);

async function main() {
const imageRoot = path.join(repoRoot, "frontend", "public", "assets", "real-products");
const results: any[] = [];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const [file, expectedNames, expectedCategory] of samples) {
  const image = await fs.readFile(path.join(imageRoot, file));
  const dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
  let response: any;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      response = await client.chat.completions.create({
    model: provider.modelName,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Bạn là hệ thống đọc nhãn/sản phẩm từ ảnh thật cho HomeX POS. Chỉ trả JSON gồm name, brand, category, supplierName, estimatedImportPrice, estimatedSalePrice, stockQuantity, minStock, warrantyMonths, description. Category chỉ chọn: Thiết bị nhà bếp, Thiết bị làm sạch, Đồ dùng gia đình, Dụng cụ nấu ăn, Thiết bị làm mát, Thiết bị điện, Đồ phòng tắm, Khác. Trường không quan sát được trực tiếp phải để null; không suy đoán giá, tồn kho, nhà cung cấp hoặc bảo hành.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Đọc sản phẩm trong ảnh và trả JSON." },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ] as any,
      },
    ],
    max_tokens: 400,
      });
      break;
    } catch (error: any) {
      if (error?.status !== 429 || attempt === 5) throw error;
      await delay(15000);
    }
  }
  if (!response) throw new Error(`No AI response for ${file}`);

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, ""));
  const normalizedName = normalize(parsed.name);
  const nameMatch = expectedNames.some((candidate) => normalizedName.includes(normalize(candidate)));
  const categoryMatch = normalize(parsed.category) === normalize(expectedCategory);
  const nonVisualFields = ["supplierName", "estimatedImportPrice", "estimatedSalePrice", "stockQuantity", "minStock", "warrantyMonths"];
  const groundedAbstentions = nonVisualFields.filter((field) => parsed[field] === null || parsed[field] === undefined || parsed[field] === "").length;

  results.push({
    file,
    expectedNames,
    expectedCategory,
    output: parsed,
    metrics: {
      nameMatch,
      categoryMatch,
      groundedAbstentionCount: groundedAbstentions,
      groundedAbstentionTotal: nonVisualFields.length,
    },
  });
  console.log(`${file}: name=${nameMatch} category=${categoryMatch} abstain=${groundedAbstentions}/${nonVisualFields.length}`);
  const partialDir = path.join(repoRoot, "docs", "benchmarks");
  await fs.mkdir(partialDir, { recursive: true });
  await fs.writeFile(path.join(partialDir, "ai-image-benchmark.partial.json"), JSON.stringify({ results }, null, 2), "utf8");
  await delay(3000);
}

const summary = {
  sampleCount: results.length,
  nameAccuracy: results.filter((item) => item.metrics.nameMatch).length / results.length,
  categoryAccuracy: results.filter((item) => item.metrics.categoryMatch).length / results.length,
  nonVisualFieldAbstentionRate: results.reduce((sum, item) => sum + item.metrics.groundedAbstentionCount, 0) /
    results.reduce((sum, item) => sum + item.metrics.groundedAbstentionTotal, 0),
  evaluatedAt: new Date().toISOString(),
  model: `${provider.modelName} via ${provider.name}`,
};

const outDir = path.join(repoRoot, "docs", "benchmarks");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "ai-image-benchmark.json"), JSON.stringify({ summary, results }, null, 2), "utf8");
console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
