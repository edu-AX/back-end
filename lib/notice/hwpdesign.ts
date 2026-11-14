// 한글(.hwp) 레퍼런스에서 디자인 읽기: DocInfo 의 글꼴·글자 모양(크기·굵기)·문단 모양(정렬), 본문 문단별 모양,
// 쪽 크기·여백, 표 유무, 안에 든 그림(BinData)을 모아 buildDesign 에 넘긴다.
// 도형 좌표는 읽지 않으므로(표 안의 칸 색 등) 표가 있으면 표 머리 색은 기본 회색으로 둔다.
import { inflateRawSync } from "node:zlib";
import * as CFB from "cfb";
import { buildDesign, defaultDesign, type DesignProfile, type StyledLine } from "./design";
import { openHwp, paraText, parseRecords, TAG } from "../upload/hwp";
import { MAX_IMAGE_BYTES } from "./png";

const HWP_UNIT_TO_PT = 1 / 100; // 1/7200 인치 = 0.01pt

const bgr = (v: number) => `#${[v & 255, (v >> 8) & 255, (v >> 16) & 255].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

interface Img { dataUrl: string; w: number; h: number }
function imageInfo(buf: Uint8Array): Img | null {
  const b = Buffer.from(buf);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { dataUrl: `data:image/png;base64,${b.toString("base64")}`, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { dataUrl: `data:image/jpeg;base64,${b.toString("base64")}`, h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

export function extractHwpDesign(bytes: Uint8Array): DesignProfile {
  const hwp = openHwp(bytes);

  // ---- DocInfo: 글꼴 이름·글자 모양·문단 모양 ----
  const faces: string[] = [];
  const charShapes: { face: number; size: number; bold: boolean; color: string }[] = [];
  const paraAligns: number[] = [];
  const docInfo = hwp.stream("/DocInfo");
  if (docInfo) {
    for (const r of parseRecords(docInfo)) {
      const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      if (r.tag === TAG.FACE_NAME && r.data.length > 3) {
        const len = dv.getUint16(1, true);
        faces.push(Buffer.from(r.data.subarray(3, 3 + len * 2)).toString("utf16le"));
      } else if (r.tag === TAG.CHAR_SHAPE && r.data.length >= 56) {
        charShapes.push({ face: dv.getUint16(0, true), size: dv.getInt32(42, true) / 100, bold: (dv.getUint32(46, true) & 2) !== 0, color: bgr(dv.getUint32(52, true)) });
      } else if (r.tag === TAG.PARA_SHAPE && r.data.length >= 4) {
        paraAligns.push((dv.getUint32(0, true) >> 2) & 7);
      }
    }
  }

  // ---- 본문: 문단 글자 + 그 문단의 글자 모양·정렬, 쪽 크기, 표 유무 ----
  let page = { w: 595, h: 842, l: 85, r: 85, t: 57, b: 57 };
  let hasTable = false;
  const paras: { text: string; shape: number; para: number; level: number }[] = [];
  for (const path of hwp.sections) {
    const raw = hwp.stream(path);
    if (!raw) continue;
    let cur: { text: string; shape: number; para: number; level: number } | null = null;
    for (const r of parseRecords(raw)) {
      const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      if (r.tag === TAG.PARA_HEADER && r.data.length >= 10) {
        cur = { text: "", shape: -1, para: dv.getUint16(8, true), level: r.level };
        paras.push(cur);
      } else if (r.tag === TAG.PARA_TEXT && cur) cur.text += paraText(r.data).replace(/\n+$/g, "");
      else if (r.tag === TAG.PARA_CHAR_SHAPE && cur && r.data.length >= 8) {
        // 글자 모양이 바뀌는 자리 목록 → 가장 오래(글자 수 많게) 쓰인 모양을 대표로
        const n = Math.floor(r.data.length / 8), span = new Map<number, number>();
        for (let i = 0; i < n; i++) {
          const pos = dv.getUint32(i * 8, true), id = dv.getUint32(i * 8 + 4, true);
          const next = i + 1 < n ? dv.getUint32((i + 1) * 8, true) : Math.max(pos + 1, cur.text.length);
          span.set(id, (span.get(id) ?? 0) + Math.max(1, next - pos));
        }
        cur.shape = [...span.entries()].sort((a, b) => b[1] - a[1])[0][0];
      } else if (r.tag === TAG.PAGE_DEF && r.data.length >= 24) {
        const v = (o: number) => dv.getUint32(o, true) * HWP_UNIT_TO_PT;
        page = { w: v(0), h: v(4), l: v(8), r: v(12), t: v(16), b: v(20) };
      } else if (r.tag === TAG.CTRL_HEADER && r.data.length >= 4) {
        if (Buffer.from(r.data.subarray(0, 4)).toString("latin1") === " lbt") hasTable = true; // "tbl " 이 거꾸로 저장됨
      }
    }
  }
  if (!paras.some((p) => p.text.trim())) throw new Error("한글 파일에서 글줄을 읽지 못했어요.");

  const bodyW = page.w - page.l - page.r;
  const lines: StyledLine[] = [];
  let y = page.t;
  let titleInTable = false;
  for (const p of paras) {
    const text = p.text.trim();
    if (!text) continue;
    const cs = charShapes[p.shape] ?? charShapes[0] ?? { face: 0, size: 11, bold: false, color: "#000000" };
    const align = paraAligns[p.para] ?? 0;
    const size = cs.size > 0 ? cs.size : 11;
    const w = Math.min(bodyW, text.length * size * 0.9);
    // 정렬을 좌표로 바꿔 buildDesign 이 같은 규칙으로 가운데·오른쪽을 알아보게 한다
    const x = align === 3 ? page.l + (bodyW - w) / 2 : align === 2 ? page.w - page.r - w : page.l;
    const full = align === 0 && text.length * size * 0.9 > bodyW * 0.85;
    lines.push({ text, sizePt: size, bold: cs.bold, fontName: faces[cs.face] ?? "", x: full ? page.l : x, xEnd: full ? page.w - page.r : x + w, y, color: cs.color });
    if (/가\s*정\s*통\s*신\s*문/.test(text) && p.level > 0) titleInTable = true;
    y += size * 1.6;
  }

  // ---- 그림: 가로로 긴 것은 로고, 정사각형에 가까운 것은 엠블럼 ----
  const imgs: Img[] = [];
  for (const full of hwp.book.FullPaths) {
    if (!/\/BinData\/[^/]+\.(png|jpe?g|gif|bmp)$/i.test(full)) continue;
    let c = CFB.find(hwp.book, full.replace(/^Root Entry/, ""))?.content as Uint8Array | undefined;
    if (!c) continue;
    let info = imageInfo(c);
    if (!info) { try { info = imageInfo(inflateRawSync(Buffer.from(c), { maxOutputLength: 20_000_000 })); } catch { info = null; } }
    if (info && info.dataUrl.length <= MAX_IMAGE_BYTES * 1.4) imgs.push(info);
    c = undefined;
  }

  const design = buildDesign("hwp", page.w, page.h, lines, { fills: [], strokes: [], images: [], hasTable });
  const fallback = defaultDesign();
  const emblem = imgs.find((i) => Math.abs(i.w / i.h - 1) < 0.5 && Math.min(i.w, i.h) > 20);
  const logo = imgs.find((i) => i !== emblem && i.w / i.h > 2);
  design.images = { ...(logo ? { logo: logo.dataUrl } : {}), ...(emblem ? { emblem: emblem.dataUrl } : {}) };
  design.header.emblem = !!emblem;
  design.header.boxed = titleInTable || fallback.header.boxed;
  design.header.grayBar = titleInTable ? fallback.header.grayBar : null;
  design.header.titleAlign = "center"; // 가정통신문 큰 제목은 대개 가운데
  design.marginMm = { top: Math.max(10, Math.round(page.t * 0.3528 * 10) / 10), right: Math.round(page.r * 0.3528 * 10) / 10, bottom: Math.round(page.b * 0.3528 * 10) / 10, left: Math.round(page.l * 0.3528 * 10) / 10 };
  design.table.headerFill = hasTable ? "#d9d9d9" : null;
  // 위에서 고친 머리말 정보(상자·엠블럼·로고·회색 줄)를 요약에도 반영
  design.summary = design.summary.map((s) => (s.startsWith("머리말:") ? `머리말: ${design.header.boxed ? "선으로 두른 상자(표)" : "상자 없음"}${design.header.emblem ? " · 제목 왼쪽에 엠블럼" : ""}${design.images.logo ? " · 위쪽 로고" : ""}${design.header.grayBar ? ` · 제목 아래 회색 줄(${design.header.grayBar})` : ""}` : s)).filter((s) => !s.startsWith("용지"));
  design.summary.unshift(`용지: ${Math.round(page.w * 0.3528)}×${Math.round(page.h * 0.3528)}mm · 여백 위 ${design.marginMm.top} 좌 ${design.marginMm.left} 우 ${design.marginMm.right}mm`);
  return design;
}
