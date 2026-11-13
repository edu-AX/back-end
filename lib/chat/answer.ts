// 챗봇 답변 흐름 전체. LLM 호출은 바깥에서 넣어 주므로(callLlm) 테스트에서 가짜로 바꿀 수 있다.
import { z } from "zod";
import type { ChatRequest, ChatResponse, ClientState, DateString, SourceRef } from "../types";
import { EMPTY_CLIENT_STATE } from "../types";
import { findDemoAnswer } from "./demo";
import { isLegalQuestion, isPersonalInfoQuestion } from "./guards";
import { BLOCKED, DISCLAIMER, LEGAL_NOTE, LLM_DOWN, NOT_FOUND, PENDING_NOTE } from "./messages";
import { buildChatUserMessage, CHAT_OUTPUT_SCHEMA, CHAT_SYSTEM_PROMPT } from "./prompt";
import { buildContext, toSourceRefs } from "./sources";

const LlmAnswer = z.object({
  answer: z.string(),
  sourceIds: z.array(z.string()),
  notFound: z.boolean(),
});

export interface AnswerDeps {
  demoMode: boolean;
  today: DateString;
  /** null 이면 API 키가 없는 것 → 고정 답으로 처리 */
  callLlm: ((p: { system: string; user: string; schema: Record<string, unknown> }) => Promise<unknown>) | null;
  state?: ClientState;
  onError?: (e: unknown) => void;
}

function respond(
  partial: Pick<ChatResponse, "answer" | "mode"> & Partial<ChatResponse>,
): ChatResponse {
  return { sources: [], notFound: false, disclaimer: DISCLAIMER, ...partial };
}

/** 법적 질문·추진 중 출처에 고정 문구를 붙인다 (프롬프트를 어겨도 코드로 보장) */
function addNotes(answer: string, question: string, sources: SourceRef[]): string {
  let out = answer.trim();
  const hasPending = sources.some((s) => s.status === "추진 중");
  if (hasPending && !/추진/.test(out)) out += `\n\n${PENDING_NOTE}`;
  if (isLegalQuestion(question) && !out.includes(LEGAL_NOTE)) out += `\n\n${LEGAL_NOTE}`;
  return out;
}

function demoResponse(question: string, mode: "demo" | "fallback", focusEventId?: string): ChatResponse {
  const demo = findDemoAnswer(question);
  if (!demo) {
    return respond({ answer: mode === "demo" ? NOT_FOUND : LLM_DOWN, notFound: true, mode });
  }
  const sources = toSourceRefs(demo.sourceIds, focusEventId);
  return respond({ answer: addNotes(demo.answer, question, sources), sources, mode });
}

export async function answerQuestion(req: ChatRequest, deps: AnswerDeps): Promise<ChatResponse> {
  const question = req.question.trim();

  // 1) 개인정보 질문은 AI에 보내지도 않는다
  if (isPersonalInfoQuestion(question)) return respond({ answer: BLOCKED, mode: "blocked" });

  // 2) 데모 모드 / API 키 없음 → 고정 답
  if (deps.demoMode) return demoResponse(question, "demo", req.focusEventId);
  if (!deps.callLlm) return demoResponse(question, "fallback", req.focusEventId);

  // 3) 실제 AI
  try {
    const raw = await deps.callLlm({
      system: CHAT_SYSTEM_PROMPT,
      user: buildChatUserMessage(
        buildContext(deps.today, deps.state ?? EMPTY_CLIENT_STATE),
        question,
        req.focusEventId,
      ),
      schema: CHAT_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    });
    const parsed = LlmAnswer.parse(raw);
    // AI가 지어낸 id 는 버린다
    const sources = toSourceRefs(parsed.sourceIds, req.focusEventId);

    // 출처가 하나도 없는 답은 믿지 않는다 (규칙: 모든 답에 출처)
    if (parsed.notFound || sources.length === 0) {
      return respond({ answer: NOT_FOUND, notFound: true, mode: "llm" });
    }
    return respond({ answer: addNotes(parsed.answer, question, sources), sources, mode: "llm" });
  } catch (e) {
    deps.onError?.(e);
    // 4) 실패하면 고정 답으로 대체
    return demoResponse(question, "fallback", req.focusEventId);
  }
}
