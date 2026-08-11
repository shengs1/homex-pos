import dotenv from "dotenv";
import { createAiClient, getConfiguredAiProviders } from "../src/services/ai-provider.service";

dotenv.config();

async function main() {
  const provider = getConfiguredAiProviders().find((item) => item.name === "Groq");
  if (!provider) throw new Error("GROQ_API_KEY chưa được cấu hình");

  // Chỉ dùng dữ liệu và ảnh giả lập; không gửi dữ liệu thật của cửa hàng ra ngoài.
  const client = createAiClient(provider);
  const textResponse = await client.chat.completions.create({
    model: provider.modelName,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "BẮT BUỘC chỉ trả đúng một JSON có dạng: {\"summary\":\"Kết quả thử\",\"recommendations\":[{\"productId\":101,\"reason\":\"Phù hợp\"}],\"overview\":\"Kết quả kho thử\",\"restockList\":[{\"sku\":\"SP-MAU-01\",\"suggestedRestockQuantity\":3}]}. Không đổi tên trường, không bọc markdown.",
      },
      {
        role: "user",
        content: "Dữ liệu giả: khách cần nồi cơm, ứng viên productId 101; kho giả có SKU SP-MAU-01, tồn 2, mức tối thiểu 5.",
      },
    ],
  });

  const imageResponse = await client.chat.completions.create({
    model: provider.visionModelName,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Chỉ trả JSON {\"imageReceived\":true} nếu nhận được ảnh thử.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Đây là ảnh giả lập để kiểm tra kết nối. Hãy xác nhận đã nhận ảnh." },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAJ8SURBVHhe7dJBakNBEANRHzZXyjFzhoRZGIwgK+OWelSCt8ki/j3U4+v75xe9HvoHdCGAcgRQjgDKEUA5AihHAOUIoBwBlCOAcgRQjgDKEUA5AihHAOUIoBwBlCOAcgRQjgDKEUA5AihHAOUIoBwBlCOAcgRQjgDKEUA5AihHAOUIoFxFAO9M/9dtrg3gE9PfuMFVAUxOf3urKwJwTr9lm/UBJEy/aZO1ASROv3GDlQEkT7813boANky/OdmaADZOb0i0IoDN01vSEMCHp7ekiQ/ghulNSaIDuGl6W4rYAG6c3piAAIand7pFBnDz9Fa3uAAapjc7EYBherNTVABN09tdCMA0vd2FAEzT211iAmicvoEDARinb+BAAMbpGzhEBNA8fYtpBGCevsU0AjBP32IaAZinbzGNAMzTt5hGAObpW0wjAPP0LabZA2ifvsc0ewBH8/QtphGAefoW0wjAPH2LaQRgnr7FNAIwT99iGgGYp28xjQDM07eYFhHA0Th9AwcCME7fwIEAjNM3cIgJ4Gia3u5CAKbp7S4EYJre7hIVwNEwvdmJAAzTm53iAjhunt7qFhnAcev0TjcCGJzemCA2gOOm6W0pogM4bpjelCQ+gGPz9JY0BPDh6S1pVgRwbJzekGhNAE8bpt+cbF0AR/L0W9OtDOBInH7jBmsDOJKm37bF6gCenNNv2eaKAJ4mp7+91VUBvPrE9DducG0Ar96Z/q/bVASA/xFAOQIoRwDlCKAcAZQjgHIEUI4AyhFAOQIoRwDlCKAcAZQjgHIEUI4AyhFAOQIoRwDlCKAcAZQjgHIEUI4AyhFAOQIoRwDlCKAcAZQjgHIEUO4Pbwvb2dpb3xUAAAAASUVORK5CYII=",
            },
          },
        ] as any,
      },
    ],
  });

  const parsedText = JSON.parse(textResponse.choices[0]?.message?.content || "{}");
  const parsedImage = JSON.parse(imageResponse.choices[0]?.message?.content || "{}");
  const result = {
    provider: provider.name,
    textModel: provider.modelName,
    visionModel: provider.visionModelName,
    posJsonValid: typeof parsedText.summary === "string" && Array.isArray(parsedText.recommendations),
    inventoryJsonValid: typeof parsedText.overview === "string" && Array.isArray(parsedText.restockList),
    imageInputValid: parsedImage.imageReceived === true,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.posJsonValid || !result.inventoryJsonValid || !result.imageInputValid) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});