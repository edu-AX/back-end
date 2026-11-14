// 행사 정보 + 레퍼런스 가정통신문 → 레퍼런스 양식에 맞는 가정통신문 초안.
// AI 키가 없거나 데모 모드이면 규칙 기반으로(양식 분석 결과를 그대로 따라) 만든다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, hasApiKey } from "@/lib/chat/llm";
import { isDemoMode } from "@/lib/env";
import { maskPersonalInfo } from "@/lib/masking";
import { composeNotice, type NoticeFacts } from "@/lib/notice/compose";
import { analyzeNoticeFormat } from "@/lib/notice/format";
import { buildNoticeUserPrompt, NOTICE_OUTPUT_SCHEMA, NOTICE_SYSTEM_PROMPT } from "@/lib/notice/prompt";
import { MAX_TEXT_CHARS } from "@/lib/upload/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (n: number) => z.string().max(n);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Facts = z.object({
  schoolName: s(40), year: s(4), eventTitle: s(80), scope: z.enum(["교내", "교외"]), eventDate: date, nights: s(20),
  venueText: s(200), targetText: s(80), participants: z.number().int().nonnegative().nullable(),
  costPerStudent: z.number().int().nonnegative().nullable(), costItems: z.array(s(40)).max(20),
  safetyStaff: s(100), safetyEduDate: date.nullable(), consentDue: date.nullable(), today: date, discloseDue: date.nullable(),
  settlement: z.object({ income: s(40), items: z.array(z.object({ name: s(40), planned: s(40) })).max(20) }).optional(),
});
const Body = z.object({
  kind: z.enum(["consent", "settlement"]),
  facts: Facts,
  /** 레퍼런스 텍스트(업로드 단계에서 이미 가려진 것). 여러 개를 보내면 첫 번째가 양식, 나머지는 문체 참고 */
  references: z.array(z.object({ name: s(120), text: z.string().trim().min(1).max(MAX_TEXT_CHARS) })).min(1).max(3),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? `${e.issues[0]?.path.join(".")}: ${e.issues[0]?.message}` : "요청 형식이 잘못됐어요";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const refs = body.references.map((r) => ({ name: r.name, text: maskPersonalInfo(r.text).maskedText }));
  const format = analyzeNoticeFormat(refs[0].text);
  const facts = body.facts as NoticeFacts;
  const skeleton = composeNotice(body.kind, facts, format);
  const base = { format, usedReference: refs[0].name };

  if (isDemoMode() || !hasApiKey()) {
    return NextResponse.json({ text: skeleton, mode: isDemoMode() ? "demo" : "fallback", ...base });
  }

  try {
    const referenceText = refs.map((r, i) => `[레퍼런스 ${i + 1}: ${i === 0 ? "양식 기준" : "문체 참고"}]\n${r.text}`).join("\n\n").slice(0, 40_000);
    const raw = (await generateJson({
      system: NOTICE_SYSTEM_PROMPT,
      user: buildNoticeUserPrompt(body.kind, facts, format, referenceText, skeleton),
      schema: NOTICE_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 8000,
    })) as { text?: unknown };
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    // AI가 행사 이름을 빠뜨리거나 너무 짧으면 규칙 기반 초안을 쓴다. 개인정보는 한 번 더 가린다.
    if (text.length < 80 || !text.includes(facts.eventTitle)) throw new Error("통신문 형식이 올바르지 않아요");
    return NextResponse.json({ text: maskPersonalInfo(text).maskedText, mode: "llm", ...base });
  } catch (e) {
    console.error("[notice/draft] LLM 오류, 규칙 기반 초안으로 대체:", e instanceof Error ? e.message : e);
    return NextResponse.json({ text: skeleton, mode: "fallback", ...base });
  }
}
