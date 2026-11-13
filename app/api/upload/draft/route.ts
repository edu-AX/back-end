// 2단계: 사용자가 확인한 마스킹 텍스트 → AI → 행사 카드 초안
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, hasApiKey } from "@/lib/chat/llm";
import { isDemoMode } from "@/lib/env";
import { maskPersonalInfo } from "@/lib/masking";
import { DEMO_DRAFT, DRAFT_SCHEMA, DRAFT_SYSTEM, normalizeDraft } from "@/lib/upload/draft";
import { MAX_TEXT_CHARS } from "@/lib/upload/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ maskedText: z.string().trim().min(1).max(MAX_TEXT_CHARS) });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "maskedText 가 비었거나 너무 길어요" }, { status: 400 });
  }

  if (isDemoMode() || !hasApiKey()) {
    return NextResponse.json({ draft: DEMO_DRAFT, mode: isDemoMode() ? "demo" : "fallback" });
  }

  // 프론트에서 사용자가 고친 텍스트일 수 있으니 서버에서 한 번 더 마스킹
  const safeText = maskPersonalInfo(body.maskedText).maskedText;

  try {
    const raw = await generateJson({
      system: DRAFT_SYSTEM,
      user: `<결과보고서>\n${safeText}\n</결과보고서>\n\n위 문서로 행사 카드 초안을 만들어 줘.`,
      schema: DRAFT_SCHEMA,
      maxTokens: 16000,
    });
    return NextResponse.json({ draft: normalizeDraft(raw), mode: "llm" });
  } catch (e) {
    console.error("[upload/draft] LLM 오류, 고정 초안으로 대체:", e instanceof Error ? e.message : e);
    return NextResponse.json({ draft: DEMO_DRAFT, mode: "fallback" });
  }
}
