import { NextResponse } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/chat/answer";
import { generateJson, hasApiKey } from "@/lib/chat/llm";
import { isDateString, today } from "@/lib/dates";
import { isDemoMode } from "@/lib/env";
import type { ClientState } from "@/lib/types";
import { EMPTY_CLIENT_STATE, STEP_IDS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StateSchema = z.object({
  stepStatus: z
    .record(z.string().max(20), z.partialRecord(z.enum(STEP_IDS), z.enum(["todo", "done"])))
    .default({}),
  eventDateOverrides: z
    .record(z.string().max(20), z.string().refine(isDateString, "YYYY-MM-DD 형식이어야 해요"))
    .default({}),
  extraNotes: z
    .record(
      z.string().max(20),
      z.array(z.object({ year: z.number(), note: z.string().max(500), author: z.string().optional() })).max(50),
    )
    .default({}),
  confirmedChangeIds: z.array(z.string().max(20)).max(50).default([]),
});

const Body = z.object({
  question: z.string().trim().min(1, "질문을 입력해 주세요").max(500, "질문은 500자 이내로 입력해 주세요"),
  focusEventId: z.string().max(20).optional(),
  /** 프론트 localStorage 상태 (선택). 보내면 완료 여부·바뀐 행사일을 반영해 답한다 */
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

  const state: ClientState = body.state
    ? { ...EMPTY_CLIENT_STATE, ...(body.state as Omit<ClientState, "addedEvents">) }
    : EMPTY_CLIENT_STATE;

  const result = await answerQuestion(
    { question: body.question, focusEventId: body.focusEventId },
    {
      demoMode: isDemoMode(),
      today: today(),
      state,
      callLlm: hasApiKey() ? generateJson : null,
      onError: (e) => console.error("[chat] LLM 오류, 고정 답으로 대체:", e instanceof Error ? e.message : e),
    },
  );
  return NextResponse.json(result);
}
