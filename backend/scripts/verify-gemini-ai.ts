import dotenv from "dotenv";
import { createAiClient, getConfiguredAiProviders } from "../src/services/ai-provider.service";

dotenv.config();

async function main() {
  const provider = getConfiguredAiProviders().find((item) => item.name === "Gemini");
  if (!provider) throw new Error("GEMINI_API_KEY chưa được cấu hình");

  // Chỉ gửi dữ liệu và ảnh giả lập để kiểm tra kết nối, không gửi dữ liệu thật của cửa hàng.
  const client = createAiClient(provider);
  const response = await client.chat.completions.create({
    model: provider.modelName,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Chỉ trả một JSON gồm summary, recommendations, overview, restockList và imageReceived. recommendations là mảng gợi ý POS; restockList là mảng gợi ý nhập kho; imageReceived là true nếu nhận được ảnh.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Dữ liệu giả: khách cần nồi cơm, ứng viên productId 101; kho giả có SKU SP-MAU-01, tồn 2, mức tối thiểu 5. Hãy trả JSON đúng các trường được yêu cầu.",
          },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
            },
          },
        ] as any,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
  const result = {
    provider: provider.name,
    model: provider.modelName,
    posJsonValid: typeof parsed.summary === "string" && Array.isArray(parsed.recommendations),
    inventoryJsonValid: typeof parsed.overview === "string" && Array.isArray(parsed.restockList),
    imageInputValid: parsed.imageReceived === true,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.posJsonValid || !result.inventoryJsonValid || !result.imageInputValid) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});