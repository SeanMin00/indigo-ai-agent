import { serverEnv } from "@/lib/env/server";

export function getGeminiRuntimeConfig() {
  return {
    configured: Boolean(serverEnv.geminiApiKey),
    model: serverEnv.geminiModel,
  };
}

function getGeminiApiKey() {
  if (!serverEnv.geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  return serverEnv.geminiApiKey;
}

export async function generateGeminiText(prompt: string) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey: getGeminiApiKey(),
  });

  const response = await ai.models.generateContent({
    model: serverEnv.geminiModel,
    contents: prompt,
  });

  return response.text ?? "";
}
