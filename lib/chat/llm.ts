// Gemini API 호출. 서버(API Route)에서만 import 한다 — 브라우저 코드에서 import 하지 말 것.
import "server-only";
import { GoogleGenAI } from "@google/genai";

/** .env.local 의 GEMINI_MODEL 로 바꿀 수 있다. 기본값: 빠르고 저렴한 안정(Stable) 모델 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export class LlmUnavailableError extends Error {}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LlmUnavailableError("GEMINI_API_KEY 가 설정되지 않았습니다");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * system + user 를 보내고, schema(JSON Schema) 모양의 JSON 을 돌려받는다.
 * 발표 중 오래 기다리지 않도록 요청당 20초 제한.
 */
export async function generateJson(params: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<unknown> {
  const response = await getClient().models.generateContent({
    model: getModel(),
    contents: params.user,
    config: {
      systemInstruction: params.system,
      responseMimeType: "application/json",
      responseJsonSchema: params.schema,
      maxOutputTokens: params.maxTokens ?? 8000,
      httpOptions: { timeout: 20_000 },
    },
  });

  const text = response.text;
  // 안전 필터에 걸리거나 토큰 한도로 잘리면 text 가 비거나 JSON 이 깨진다 → 호출한 쪽이 고정 답으로 대체
  if (!text) throw new LlmUnavailableError("모델이 빈 응답을 돌려줬습니다");
  return JSON.parse(text);
}
