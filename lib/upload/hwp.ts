// 옛 한글 형식(.hwp, HWP 5.x)에서 본문 글자와 서식을 읽는다.
// .hwp 는 OLE(CFB) 컨테이너 안의 BodyText/Section* 스트림(압축)에 "레코드"로 글자가 들어 있다.
// 표 안의 글자도 같은 레코드 흐름에 들어 있어 함께 뽑힌다. 암호가 걸린 문서·배포용 문서는 읽지 않는다.
// 서버 전용 모듈이 아니어서 테스트에서 바로 불러 쓸 수 있다.
import * as CFB from "cfb";
import { inflateRawSync } from "node:zlib";

export class HwpError extends Error {}

const MAX_STREAM_BYTES = 40 * 1024 * 1024; // 압축을 풀었을 때 스트림 하나의 최대 크기 (zip 폭탄 방지)
export const TAG = { FACE_NAME: 19, CHAR_SHAPE: 21, PARA_SHAPE: 25, PARA_HEADER: 66, PARA_TEXT: 67, PARA_CHAR_SHAPE: 68, CTRL_HEADER: 71, PAGE_DEF: 73, TABLE: 77 } as const;

/** 제어 문자 중 뒤에 14바이트(7글자)가 더 붙는 것들 */
const WITH_EXTRA = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

export interface HwpRecord {
  tag: number;
  level: number;
  data: Uint8Array;
}

/** 레코드 흐름: [tag(10) | level(10) | size(12)] + 내용 (size 가 0xFFF 면 뒤 4바이트가 실제 크기) */
export function parseRecords(raw: Uint8Array): HwpRecord[] {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out: HwpRecord[] = [];
  let p = 0;
  while (p + 4 <= raw.length) {
    const h = dv.getUint32(p, true);
    p += 4;
    let size = h >>> 20;
    if (size === 0xfff) {
      if (p + 4 > raw.length) break;
      size = dv.getUint32(p, true);
      p += 4;
    }
    if (p + size > raw.length) break;
    out.push({ tag: h & 0x3ff, level: (h >>> 10) & 0x3ff, data: raw.subarray(p, p + size) });
    p += size;
  }
  return out;
}

export function paraText(data: Uint8Array): string {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let out = "";
  for (let i = 0; i + 1 < data.length; i += 2) {
    const c = dv.getUint16(i, true);
    if (c >= 32) { out += String.fromCharCode(c); continue; }
    if (c === 9) { out += " "; i += 14; continue; } // 탭
    if (WITH_EXTRA.has(c)) { i += 14; continue; } // 표·그림·필드 같은 개체 표시
    if (c === 10 || c === 13) out += "\n";
    else if (c === 24) out += "-";
    else if (c === 30 || c === 31) out += " ";
  }
  return out;
}

export interface HwpBook {
  book: CFB.CFB$Container;
  compressed: boolean;
  /** 압축을 풀어서 돌려준다 (없으면 null) */
  stream(path: string): Uint8Array | null;
  /** BodyText/Section0, 1, … 경로를 번호 순서대로 */
  sections: string[];
}

export function openHwp(buf: Uint8Array): HwpBook {
  let book: CFB.CFB$Container;
  try {
    book = CFB.read(Buffer.from(buf), { type: "buffer" });
  } catch {
    throw new HwpError("한글 파일(hwp)을 열지 못했어요. 파일이 손상됐거나 hwp 형식이 아니에요.");
  }
  const header = CFB.find(book, "/FileHeader")?.content as Uint8Array | undefined;
  if (!header || header.length < 40 || Buffer.from(header.subarray(0, 17)).toString("latin1") !== "HWP Document File") {
    throw new HwpError("한글 파일(hwp)이 아니에요.");
  }
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  const compressed = (flags & 1) !== 0;
  if (flags & 2) throw new HwpError("암호가 걸린 한글 파일은 읽지 못해요. 암호를 풀고 다시 저장해 주세요.");
  if (flags & 4) throw new HwpError("배포용 문서는 읽지 못해요. 한글에서 PDF나 hwpx로 저장해 올려 주세요.");

  const sections = book.FullPaths.map((p) => p.replace(/^Root Entry/, ""))
    .filter((p) => /^\/?BodyText\/Section\d+$/i.test(p))
    .sort((a, b) => Number(/(\d+)$/.exec(a)![1]) - Number(/(\d+)$/.exec(b)![1]));
  if (sections.length === 0) throw new HwpError("한글 파일에서 본문을 찾지 못했어요.");

  return {
    book, compressed, sections,
    stream(path: string) {
      const content = CFB.find(book, path)?.content as Uint8Array | undefined;
      if (!content) return null;
      if (!compressed) return content;
      try {
        return inflateRawSync(Buffer.from(content), { maxOutputLength: MAX_STREAM_BYTES });
      } catch {
        throw new HwpError("한글 파일의 본문을 풀지 못했어요. 파일이 손상됐을 수 있어요.");
      }
    },
  };
}

export function extractHwpText(buf: Uint8Array): string {
  const hwp = openHwp(buf);
  const parts: string[] = [];
  for (const path of hwp.sections) {
    const raw = hwp.stream(path);
    if (!raw) continue;
    const paras = parseRecords(raw).filter((r) => r.tag === TAG.PARA_TEXT).map((r) => paraText(r.data).replace(/\n+$/g, ""));
    parts.push(paras.filter((s) => s.trim()).join("\n"));
  }
  return parts.join("\n");
}
