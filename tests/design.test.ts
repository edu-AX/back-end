import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { deflateRawSync } from "node:zlib";
import { buildDesign, defaultDesign, fontSpec, type Graphics, type StyledLine } from "@/lib/notice/design";
import { extractHwpDesign } from "@/lib/notice/hwpdesign";
import { encodePng } from "@/lib/notice/png";

const line = (text: string, sizePt: number, x: number, xEnd: number, y: number, fontName = "HCRDotum", bold = false): StyledLine => ({ text, sizePt, bold, fontName, x, xEnd, y });

// 실제 통신문(A4 595×842pt)의 구조를 흉내 낸 가상 글줄·도형
const LINES: StyledLine[] = [
  line("가상 표어", 10, 124, 300, 60, "HCRBatang"),
  line("가 정 통 신 문", 33, 135, 330, 105, "H2hdrM"),
  line("담당자: 2학년부 ☎ ○○○", 9, 370, 540, 110, "HCRBatang-Bold"),
  line("제목: 2026학년도 2학년 수학여행 실시 안내", 12, 123, 400, 150, "MalgunGothic"),
  line("학부모님 가정에 건강과 평안이 가득하시기를 기원합니다.", 11, 53, 540, 190),
  line("본교에서는 학생들의 문화예술 감성을 함양할 수 있는 기회를 제공하고자 합니다 오래오래", 11, 47.8, 548, 208),
  line("함께 작품을 감상해 보시기 바랍니다 감사합니다 오래오래오래 길게길게 이어지는 줄", 11, 47.8, 548, 226),
  line("1. 학교 갤러리 하반기 전시 일정", 11, 49, 250, 270, "HCRDotum-Bold", true),
  line("* 위 일정은 변경될 수 있음", 10, 90, 220, 330),
  line("2026년 11월 12일", 14, 250, 350, 600, "GungsuhChe"),
  line("인 천 고 등 학 교 장", 19, 210, 390, 640, "GungsuhChe"),
];
const GFX: Graphics = {
  fills: [
    { x: 118, y: 135, w: 440, h: 6, color: "#b2b2b2" }, // 제목 아래 회색 줄
    { x: 100, y: 285, w: 90, h: 20, color: "#e0e5fa" }, { x: 190, y: 285, w: 90, h: 20, color: "#e0e5fa" }, // 표 머리 칸
  ],
  strokes: [
    { x: 40, y: 80, w: 518, h: 0.5, width: 0.5 }, { x: 40, y: 165, w: 518, h: 0.5, width: 0.5 }, { x: 40, y: 130, w: 518, h: 0.5, width: 0.5 },
    { x: 100, y: 285, w: 0.5, h: 60, width: 0.5 },
  ],
  images: [{ x: 40, y: 50, w: 79, h: 26, dataUrl: "data:image/png;base64,AAA" }, { x: 40, y: 90, w: 78, h: 76, dataUrl: "data:image/png;base64,BBB" }],
};

describe("글꼴 이름 → 웹 글꼴", () => {
  it("한컴 글꼴 이름을 대체 글꼴 목록으로 바꾼다", () => {
    expect(fontSpec("INPILL+HCRDotum-Bold")).toMatchObject({ bold: true, original: "HCRDotum-Bold" });
    expect(fontSpec("HCRDotum").family).toContain("함초롬돋움");
    expect(fontSpec("HCRBatang").family).toContain("함초롬바탕");
    expect(fontSpec("H2hdrM")).toMatchObject({ bold: true });
    expect(fontSpec("H2hdrM").family).toContain("헤드라인");
    expect(fontSpec("MalgunGothic").bold).toBe(false);
  });
});

describe("레퍼런스 디자인 읽기 (글줄·도형 → 디자인)", () => {
  const d = buildDesign("pdf", 595, 842, LINES, GFX);

  it("크기·글꼴·정렬을 역할별로 읽는다", () => {
    expect(d.sizes).toMatchObject({ title: 33, subject: 12, body: 11, heading: 11, meta: 9, slogan: 10, note: 10, closingDate: 14, closingSchool: 19 });
    expect(d.fonts.title.original).toBe("H2hdrM");
    expect(d.fonts.heading.bold).toBe(true);
    expect(d.header.titleAlign).toBe("center");
    expect(d.closing.align).toBe("center");
    expect(d.pageMm[0]).toBeCloseTo(210, 0);
  });

  it("머리말 상자·엠블럼·로고·회색 줄·표 머리 색을 알아본다", () => {
    expect(d.header).toMatchObject({ boxed: true, emblem: true, grayBar: "#b2b2b2" });
    expect(d.table.headerFill).toBe("#e0e5fa");
    expect(d.images.logo).toBeDefined();
    expect(d.images.emblem).toBeDefined();
    expect(d.summary.length).toBeGreaterThan(4);
  });

  it("쪽 테두리는 가장자리의 긴 선 네 개로도 알아본다", () => {
    const g: Graphics = { ...GFX, strokes: [...GFX.strokes, { x: 40, y: 40, w: 0.5, h: 760, width: 1 }, { x: 558, y: 40, w: 0.5, h: 760, width: 1 }, { x: 40, y: 40, w: 518, h: 0.5, width: 1 }, { x: 40, y: 800, w: 518, h: 0.5, width: 1 }] };
    expect(buildDesign("pdf", 595, 842, LINES, g).pageBorder).toBe(true);
    expect(d.pageBorder).toBe(false);
  });

  it("글줄이 없으면 기본 디자인", () => {
    expect(buildDesign("pdf", 595, 842, [], { fills: [], strokes: [], images: [] }).header.boxed).toBe(defaultDesign().header.boxed);
  });
});

describe("PNG 만들기", () => {
  it("RGB 데이터를 올바른 PNG 로 만든다", () => {
    const png = encodePng(2, 1, 2, new Uint8Array([255, 0, 0, 0, 0, 255]));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(2); // 너비
    expect(png.readUInt32BE(20)).toBe(1); // 높이
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe("IEND");
  });
});

// ---- 합성 .hwp ----
function record(tag: number, data: Uint8Array, level = 0): Uint8Array {
  const head = Buffer.alloc(4);
  head.writeUInt32LE((tag & 0x3ff) | (level << 10) | (data.length << 20), 0);
  return Buffer.concat([head, data]);
}
const utf16 = (s: string) => Buffer.from(s, "utf16le");
function faceName(name: string) { const b = Buffer.alloc(3 + name.length * 2); b.writeUInt16LE(name.length, 1); utf16(name).copy(b, 3); return record(19, b); }
function charShape(face: number, size: number, bold: boolean) { const b = Buffer.alloc(72); b.writeUInt16LE(face, 0); b.writeInt32LE(size * 100, 42); b.writeUInt32LE(bold ? 2 : 0, 46); return record(21, b); }
function paraShape(align: number) { const b = Buffer.alloc(54); b.writeUInt32LE(align << 2, 0); return record(25, b); }
function para(text: string, shape: number, paraShapeId: number, level = 0) {
  const hdr = Buffer.alloc(22); hdr.writeUInt16LE(paraShapeId, 8);
  const cs = Buffer.alloc(8); cs.writeUInt32LE(0, 0); cs.writeUInt32LE(shape, 4);
  return [record(66, hdr, level), record(67, Buffer.concat([utf16(text), utf16("\r")]), level + 1), record(68, cs, level + 1)];
}
function pageDef() { const b = Buffer.alloc(40); [59528, 84188, 8504, 8504, 5668, 5668].forEach((v, i) => b.writeUInt32LE(v, i * 4)); return record(73, b); }
function makeHwp(): Buffer {
  const book = CFB.utils.cfb_new();
  const header = Buffer.alloc(256); header.write("HWP Document File", 0, "latin1"); header.writeUInt32LE(1, 36);
  CFB.utils.cfb_add(book, "/FileHeader", header);
  const docInfo = Buffer.concat([faceName("HCRDotum"), faceName("H2hdrM"), charShape(0, 11, false), charShape(1, 23, true), paraShape(0), paraShape(3)]);
  CFB.utils.cfb_add(book, "/DocInfo", deflateRawSync(docInfo));
  const ctrl = Buffer.concat([Buffer.from(" lbt", "latin1"), Buffer.alloc(8)]);
  const section = Buffer.concat([
    pageDef(), record(71, ctrl),
    ...para("가 정 통 신 문", 1, 1, 2), ...para("제목: 2026학년도 수학여행 안내", 0, 0, 2),
    ...para("학부모님 가정에 건강과 평안이 가득하시기를 기원합니다. 본교에서는 학생들을 대상으로 행사를 실시하고자 합니다.", 0, 0),
  ]);
  CFB.utils.cfb_add(book, "/BodyText/Section0", deflateRawSync(section));
  return Buffer.from(CFB.write(book, { type: "buffer" }) as Buffer);
}

describe("한글(.hwp) 디자인 읽기", () => {
  it("글꼴·크기·굵기·정렬·쪽 여백·표 유무를 읽는다", () => {
    const d = extractHwpDesign(new Uint8Array(makeHwp()));
    expect(d.source).toBe("hwp");
    expect(d.fonts.title.original).toBe("H2hdrM");
    expect(d.sizes.title).toBe(23);
    expect(d.fonts.title.bold).toBe(true);
    expect(d.sizes.body).toBe(11);
    expect(d.fonts.body.original).toBe("HCRDotum");
    expect(d.pageMm[0]).toBeCloseTo(210, 0);
    expect(d.marginMm.left).toBeCloseTo(30, 0);
    expect(d.header.boxed).toBe(true); // 큰 제목이 표 안에 있음
    expect(d.table.headerFill).toBe("#d9d9d9"); // 표가 있음
  });
});
