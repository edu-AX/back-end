import { NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/chat/answer";
import { generateJson, hasApiKey } from "@/lib/chat/llm";
import { today } from "@/lib/dates";
import { isDemoMode } from "@/lib/env";
import { StateSchema, toClientState } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().trim().min(1, "질문을 입력해 주세요").max(500, "질문은 500자 이내로 입력해 주세요"),
  focusEventId: z.string().max(20).optional(),
  /** 프론트 localStorage 상태 (선택). 보내면 완료 여부·바뀐 행사일·추가한 기준 변경을 반영해 답한다 */
  state: StateSchema.optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "요청 형식이 잘못됐어요";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const result = await answerQuestion(
    { question: body.question, focusEventId: body.focusEventId },
    {
      demoMode: isDemoMode(),
      today: today(),
      state: toClientState(body.state),
      callLlm: hasApiKey() ? generateJson : null,
      onError: (e) => console.error("[chat] LLM 오류, 고정 답으로 대체:", e instanceof Error ? e.message : e),
    },
  );
  return NextResponse.json(result);
}
