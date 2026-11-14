import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { deflateRawSync } from "node:zlib";
import { extractHwpText, HwpError } from "@/lib/upload/hwp";

/** 레코드 하나: [tag(10) | level(10) | size(12)] + 내용 */
function record(tag: number, data: Uint8Array): Uint8Array {
  const big = data.length >= 0xfff;
  const head = Buffer.alloc(big ? 8 : 4);
  head.writeUInt32LE((tag & 0x3ff) | (0 << 10) | ((big ? 0xfff : data.length) << 20), 0);
  if (big) head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data]);
}
const utf16 = (s: string) => Buffer.from(s, "utf16le");
/** 문단 글자: 끝에 문단 나눔(13) */
const para = (s: string) => record(67, Buffer.concat([utf16(s), utf16("\r")]));
/** 개체 제어 문자(표 등): 코드 11 + 14바이트 */
const control = () => Buffer.concat([utf16("\u000b"), Buffer.alloc(14)]);

function makeHwp(sections: Uint8Array[][], flags = 1): Buffer {
  const book = CFB.utils.cfb_new();
  const header = Buffer.alloc(256);
  header.write("HWP Document File", 0, "latin1");
  header.writeUInt32LE(flags, 36);
  CFB.utils.cfb_add(book, "/FileHeader", header);
  sections.forEach((recs, i) => {
    const raw = Buffer.concat(recs);
    CFB.utils.cfb_add(book, `/BodyText/Section${i}`, flags & 1 ? deflateRawSync(raw) : raw);
  });
  return Buffer.from(CFB.write(book, { type: "buffer" }) as Buffer);
}

describe("hwp(옛 한글) 본문 추출", () => {
  it("압축된 본문에서 문단별 글자를 뽑는다", () => {
    const buf = makeHwp([[record(66, Buffer.alloc(4)), para("가정통신문"), para("1. 행사 개요"), para("  가. 일시: 2026. 11. 4.(수)")]]);
    expect(extractHwpText(buf)).toBe("가정통신문\n1. 행사 개요\n  가. 일시: 2026. 11. 4.(수)");
  });

  it("표 같은 개체 표시와 탭은 건너뛰고 글자만 남긴다", () => {
    // 실제 한글 파일에서 탭도 뒤에 14바이트가 붙는다
    const tab = Buffer.concat([utf16("\t"), Buffer.alloc(14)]);
    const buf = makeHwp([[record(67, Buffer.concat([control(), utf16("구분"), tab, utf16("내용"), utf16("\r")]))]]);
    expect(extractHwpText(buf)).toBe("구분 내용");
  });

  it("섹션이 여러 개면 번호 순서대로 잇는다", () => {
    const buf = makeHwp([[para("영")], [para("일")], [para("이")]]);
    expect(extractHwpText(buf)).toBe("영\n일\n이");
  });

  it("압축 안 된 문서도 읽는다", () => {
    expect(extractHwpText(makeHwp([[para("본문")]], 0))).toBe("본문");
  });

  it("암호·배포용·hwp 가 아닌 파일은 HwpError", () => {
    expect(() => extractHwpText(makeHwp([[para("x")]], 1 | 2))).toThrow(/암호/);
    expect(() => extractHwpText(makeHwp([[para("x")]], 1 | 4))).toThrow(/배포용/);
    expect(() => extractHwpText(new Uint8Array([1, 2, 3, 4]))).toThrow(HwpError);
  });
});
