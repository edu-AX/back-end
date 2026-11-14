// 레퍼런스 가정통신문 파일 → 글(개인정보 가림) + 양식(구성) + 디자인(모양)을 한 번에 돌려준다. 파일은 저장하지 않는다.
import { NextResponse } from "next/server";
import { defaultDesign, type DesignProfile } from "@/lib/notice/design";
import { analyzeNoticeFormat } from "@/lib/notice/format";
import { extractHwpDesign } from "@/lib/notice/hwpdesign";
import { extractPdfDesign } from "@/lib/notice/pdfdesign";
import { maskPersonalInfo } from "@/lib/masking";
import { extractTextFromFile, UploadError } from "@/lib/upload/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function designOf(file: File): Promise<{ design: DesignProfile; note?: string }> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") return { design: await extractPdfDesign(bytes) };
    if (name.endsWith(".hwp")) return { design: extractHwpDesign(bytes) };
  } catch (e) {
    console.error("[notice/reference] 디자인 추출 실패, 기본 디자인 사용:", e instanceof Error ? e.message : e);
    return { design: defaultDesign(), note: "디자인을 읽지 못해 기본 디자인으로 그려요." };
  }
  // hwpx·txt 는 글만 읽는다 (디자인은 기본값)
  return { design: defaultDesign(), note: "이 파일 형식은 글 구성만 읽고, 디자인은 기본 디자인으로 그려요. (디자인까지 따라 하려면 hwp 또는 PDF로 올려 주세요)" };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file 필드로 파일을 보내 주세요" }, { status: 400 });
    const text = await extractTextFromFile(file);
    const masked = maskPersonalInfo(text);
    const { design, note } = await designOf(file);
    return NextResponse.json({
      fileName: file.name, charCount: text.length, maskedText: masked.maskedText, maskCount: masked.maskCount, hits: masked.hits,
      format: analyzeNoticeFormat(masked.maskedText), design, designNote: note ?? null,
    });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[notice/reference]", e);
    return NextResponse.json({ error: "파일을 처리하지 못했어요" }, { status: 500 });
  }
}
