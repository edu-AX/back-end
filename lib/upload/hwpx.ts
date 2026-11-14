// 한글(.hwpx) 파일에서 본문 글자만 뽑는다.
// hwpx 는 zip 안에 XML 문서가 들어 있는 형식이라, Contents/section*.xml 의 <hp:t> 글자만 모으면 된다.
// (옛 바이너리 형식 .hwp 는 지원하지 않는다. 한글에서 hwpx 나 PDF 로 다시 저장해 올려야 한다.)
// 서버 전용 모듈이 아니어서 테스트에서 바로 불러 쓸 수 있다.
import { unzipSync, strFromU8 } from "fflate";

/** 압축을 풀었을 때 파일 하나가 이 크기를 넘으면 읽지 않는다 (zip 폭탄 방지) */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const SECTION_RE = /^Contents\/section(\d+)\.xml$/i;

export class HwpxError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? "";
  });
}

/** <hp:p> 한 문단의 글자: <hp:t> 안쪽 글자 + 탭·줄바꿈 표시를 공백/줄바꿈으로 */
function paragraphText(pXml: string): string {
  const parts: string[] = [];
  const re = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|<hp:t\s*\/>|<hp:(tab|lineBreak)\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml))) {
    if (m[2] === "tab") parts.push(" ");
    else if (m[2] === "lineBreak") parts.push("\n");
    else if (m[1] !== undefined) parts.push(decodeEntities(m[1].replace(/<[^>]+>/g, "")));
  }
  return parts.join("");
}

export function extractHwpxText(buf: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, { filter: (f) => SECTION_RE.test(f.name) && f.originalSize <= MAX_ENTRY_BYTES });
  } catch {
    throw new HwpxError("한글 파일(hwpx)을 열지 못했어요. 파일이 손상됐거나 hwpx 형식이 아니에요.");
  }
  const names = Object.keys(files).sort((a, b) => Number(SECTION_RE.exec(a)![1]) - Number(SECTION_RE.exec(b)![1]));
  if (names.length === 0) {
    throw new HwpxError("한글 파일에서 본문을 찾지 못했어요. 암호가 걸렸거나 hwpx 형식이 아닐 수 있어요.");
  }
  const lines: string[] = [];
  for (const name of names) {
    const xml = strFromU8(files[name]);
    for (const p of xml.split(/<\/hp:p>/)) {
      const t = paragraphText(p).trim();
      if (t) lines.push(t);
    }
  }
  return lines.join("\n");
}
