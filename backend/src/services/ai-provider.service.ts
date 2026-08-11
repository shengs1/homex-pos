import OpenAI from "openai";

export type AiProvider = {
  name: "Gemini" | "Groq";
  apiKey: string;
  baseURL: string;
  modelName: string;
  visionModelName: string;
};

// Tạo danh sách dịch vụ AI theo thứ tự ưu tiên của dự án:
// Gemini là dịch vụ chính, Groq là dịch vụ dự phòng.
export function getConfiguredAiProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();

  if (geminiApiKey) {
    providers.push({
      name: "Gemini",
      apiKey: geminiApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      modelName: process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
      visionModelName: process.env.GEMINI_VISION_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
    });
  }

  if (groqApiKey) {
    providers.push({
      name: "Groq",
      apiKey: groqApiKey,
      baseURL: "https://api.groq.com/openai/v1",
      modelName: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      visionModelName: process.env.GROQ_VISION_MODEL?.trim() || "qwen/qwen3.6-27b",
    });
  }

  return providers;
}

export function createAiClient(provider: AiProvider) {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
  });
}

// Chạy tác vụ bằng Gemini trước. Nếu Gemini lỗi hoặc trả kết quả không hợp lệ,
// hệ thống tự chuyển sang Groq. Nếu cả hai đều lỗi, service gọi hàm này sẽ dùng
// cách chấm điểm hoặc công thức cục bộ đã chuẩn bị sẵn.
export async function runWithAiProviderFallback<T>(
  taskName: string,
  operation: (client: OpenAI, provider: AiProvider) => Promise<T | null>,
): Promise<T | null> {
  for (const provider of getConfiguredAiProviders()) {
    try {
      const result = await operation(createAiClient(provider), provider);
      if (result !== null) return result;
    } catch (error) {
      console.warn(`[${taskName}] ${provider.name} bị lỗi, đang thử dịch vụ tiếp theo...`, error);
    }
  }

  return null;
}