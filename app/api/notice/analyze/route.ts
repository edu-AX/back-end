// 레퍼런스 가정통신문(텍스트) → 양식 분석. 개인정보를 한 번 더 가린 뒤 분석한다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { maskPersonalInfo } from "@/lib/masking";
import { analyzeNoticeFormat } from "@/lib/notice/format";
import { MAX_TEXT_CHARS } from "@/lib/upload/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(1).max(MAX_TEXT_CHARS) });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "text 가 비었거나 너무 길어요" }, { status: 400 });
  }
  const masked = maskPersonalInfo(body.text).maskedText;
  return NextResponse.json({ format: analyzeNoticeFormat(masked) });
}
