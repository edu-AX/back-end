// 1단계: 파일 → 텍스트 추출 → 개인정보 마스킹 → 미리보기 돌려주기. 파일은 저장하지 않는다.
import { NextResponse } from "next/server";
import { maskPersonalInfo } from "@/lib/masking";
import { extractTextFromFile, UploadError } from "@/lib/upload/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file 필드로 파일을 보내 주세요" }, { status: 400 });
    }
    const text = await extractTextFromFile(file);
    const masked = maskPersonalInfo(text);
    return NextResponse.json({ fileName: file.name, charCount: text.length, ...masked });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[upload/extract]", e);
    return NextResponse.json({ error: "파일을 처리하지 못했어요" }, { status: 500 });
  }
}
