// 업로드 파일에서 텍스트만 뽑는다. 파일은 메모리에서만 다루고 어디에도 저장하지 않는다.
import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel 요청 크기 제한(4.5MB)보다 작게
export const MAX_TEXT_CHARS = 60_000;

export class UploadError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new UploadError("파일이 너무 커요. 4MB 이하로 올려 주세요.", 413);

  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());

  let text: string;
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const pdf = await getDocumentProxy(buf);
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } catch {
      throw new UploadError("PDF에서 글자를 읽지 못했어요. 스캔한 이미지 PDF는 지원하지 않아요.");
    }
  } else if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    text = new TextDecoder("utf-8").decode(buf);
  } else {
    throw new UploadError("PDF 또는 txt 파일만 올릴 수 있어요. (HWP는 PDF로 저장해서 올려 주세요)", 415);
  }

  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) throw new UploadError("파일에서 읽을 수 있는 글자가 없어요.");
  if (text.length > MAX_TEXT_CHARS)
    throw new UploadError(`문서가 너무 길어요 (${text.length.toLocaleString()}자). 결과보고서 부분만 올려 주세요.`, 413);
  return text;
}
