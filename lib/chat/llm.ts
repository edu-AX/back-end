// AI 호출: BAZE API Gateway (OpenAI 호환 chat/completions). 서버(API Route)에서만 import 한다 — 브라우저 코드에서 import 하지 말 것.
// 키는 .env.local 의 BAZE_API_KEY 에만 두고, 응답·로그 어디에도 내보내지 않는다.
import "server-only";

/** BAZE 게이트웨이 주소. 키를 발급한 배포와 같은 호스트여야 한다 */
export const BAZE_BASE_URL = "https://api.baze.co/v1/gateway";

/** .env.local 의 BAZE_MODEL 로 바꿀 수 있다 (예: claude-haiku-5-5, gpt-6-luna). 기본값: 빠르고 저렴한 모델 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export function getModel(): string {
  return process.env.BAZE_MODEL?.trim() || DEFAULT_MODEL;
}

export class LlmUnavailableError extends Error {}

function apiKey(): string {
  const key = process.env.BAZE_API_KEY?.trim();
  if (!key) throw new LlmUnavailableError("BAZE_API_KEY 가 설정되지 않았습니다");
  return key;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.BAZE_API_KEY?.trim());
}

type ChatCompletion = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  detail?: unknown;
  error?: unknown;
};

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
  let res: Response;
  try {
    res = await fetch(`${BAZE_BASE_URL}/chat/completions/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: params.maxTokens ?? 8000,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        // 스키마는 Gemini 용으로 쓴 것이라 OpenAI strict 규칙(모든 필드 required 등)을 다 맞추진 않는다 → strict 끔
        response_format: { type: "json_schema", json_schema: { name: "result", strict: false, schema: params.schema } },
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new LlmUnavailableError(`BAZE 요청 실패: ${e instanceof Error ? e.name : "network"}`);
  }

  if (!res.ok) {
    // 401 = 키가 틀렸거나 다른 BAZE 배포의 키, 402/429 = 크레딧·호출 한도
    throw new LlmUnavailableError(`BAZE 응답 오류 ${res.status}`);
  }
  const data = (await res.json()) as ChatCompletion;
  const text = data.choices?.[0]?.message?.content;
  // 안전 필터에 걸리거나 토큰 한도로 잘리면 text 가 비거나 JSON 이 깨진다 → 호출한 쪽이 고정 답으로 대체
  if (!text) throw new LlmUnavailableError("모델이 빈 응답을 돌려줬습니다");
  return JSON.parse(stripFence(text));
}

/** 일부 모델이 ```json … ``` 으로 감싸 돌려주는 경우 */
function stripFence(s: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(s);
  return m ? m[1] : s;
}
