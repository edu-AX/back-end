// PDF 레퍼런스에서 디자인 읽기: 글줄(위치·크기·글꼴)·그린 도형(선·색 칠한 칸)·그림을 모아 buildDesign 에 넘긴다.
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { buildDesign, type DesignProfile, type Graphics, type StyledLine } from "./design";
import { encodePng, MAX_IMAGE_BYTES, pngDataUrl } from "./png";

const MAX_PAGES = 4;
type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** constructPath 의 경로 데이터 → 점 목록 (0 moveTo, 1 lineTo, 2 곡선, 3 2차 곡선, 4 닫기) */
function pathPoints(data: ArrayLike<number>): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < data.length; ) {
    const c = data[i++];
    if (c === 0 || c === 1) { pts.push([data[i], data[i + 1]]); i += 2; }
    else if (c === 2) { pts.push([data[i + 4], data[i + 5]]); i += 6; }
    else if (c === 3) { pts.push([data[i + 2], data[i + 3]]); i += 4; }
    else if (c !== 4) break;
  }
  return pts;
}

export async function extractPdfDesign(bytes: Uint8Array): Promise<DesignProfile> {
  const pdf = await getDocumentProxy(bytes, { fontExtraProperties: true });
  const pdfjs = await getResolvedPDFJS();
  const OPS = pdfjs.OPS as Record<string, number>;
  const lines: StyledLine[] = [];
  const gfx: Graphics = { fills: [], strokes: [], images: [] };
  let pageW = 595, pageH = 842;

  const pages = Math.min(pdf.numPages, MAX_PAGES);
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    if (p === 1) { pageW = vp.width; pageH = vp.height; }
    const yOff = (p - 1) * pageH;
    const top = (y: number) => pageH - y + yOff;

    const opl = await page.getOperatorList();
    let ctm: Mat = [1, 0, 0, 1, 0, 0];
    const stack: { ctm: Mat; fill: string; lw: number }[] = [];
    let fill = "#000000", lw = 1;
    for (let i = 0; i < opl.fnArray.length; i++) {
      const fn = opl.fnArray[i], a = opl.argsArray[i];
      if (fn === OPS.save) stack.push({ ctm, fill, lw });
      else if (fn === OPS.restore) { const s = stack.pop(); if (s) ({ ctm, fill, lw } = s); }
      else if (fn === OPS.transform) ctm = mul(ctm, a as Mat);
      else if (fn === OPS.setFillRGBColor) fill = String(a[0]).startsWith("#") ? String(a[0]) : `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
      else if (fn === OPS.setFillGray) fill = `#${hex2(a[0] * 255).repeat(3)}`;
      else if (fn === OPS.setLineWidth) lw = Number(a[0]) * Math.hypot(ctm[0], ctm[1]);
      else if (fn === OPS.constructPath) {
        const paint = a[0] as number;
        if (paint < OPS.stroke || paint > OPS.closeEOFillStroke) continue; // 클리핑·endPath 는 건너뜀
        const raw = a[1]?.[0];
        if (!raw) continue;
        const pts = pathPoints(raw as ArrayLike<number>).map(([x, y]) => apply(ctm, x, y));
        if (pts.length < 2) continue;
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const box = { x: x0, y: top(y1), w: x1 - x0, h: y1 - y0 };
        const isFill = paint === OPS.fill || paint === OPS.eoFill || paint === OPS.fillStroke || paint === OPS.eoFillStroke || paint === OPS.closeFillStroke || paint === OPS.closeEOFillStroke;
        const isStroke = paint === OPS.stroke || paint === OPS.closeStroke || paint === OPS.fillStroke || paint === OPS.eoFillStroke || paint === OPS.closeFillStroke || paint === OPS.closeEOFillStroke;
        if (isFill && box.w > 1 && box.h > 1 && !(box.w >= pageW * 0.95 && box.h >= pageH * 0.95)) gfx.fills.push({ ...box, color: fill });
        if (isStroke) gfx.strokes.push({ ...box, width: Math.max(lw, 0.1) });
      } else if (fn === OPS.paintImageXObject) {
        const [x0, y0] = apply(ctm, 0, 0), [x1, y1] = apply(ctm, 1, 1);
        const box = { x: Math.min(x0, x1), y: top(Math.max(y0, y1)), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        let dataUrl: string | undefined;
        try {
          const img = page.objs.get(a[0] as string) as { width: number; height: number; kind: number; data?: Uint8Array } | undefined;
          if (img?.data && (img.kind === 1 || img.kind === 2 || img.kind === 3)) {
            const png = encodePng(img.width, img.height, img.kind as 1 | 2 | 3, img.data);
            if (png.length <= MAX_IMAGE_BYTES) dataUrl = pngDataUrl(png);
          }
        } catch { /* 그림을 못 읽어도 자리만 기록 */ }
        gfx.images.push({ ...box, dataUrl });
      }
    }

    // 글줄: 같은 높이의 글자 조각을 모으되, 간격이 크면 다른 덩어리(예: 큰 제목 / 오른쪽 담당자)로 나눈다
    const tc = await page.getTextContent();
    const fontName = (id: string) => { try { return String((page.commonObjs.get(id) as { name?: string })?.name ?? ""); } catch { return ""; } };
    const items = tc.items
      .filter((it): it is typeof it & { str: string; transform: number[]; width: number; fontName: string } => "str" in it && !!it.str.trim())
      .map((it) => ({ str: it.str, x: it.transform[4], y: top(it.transform[5]), size: Math.hypot(it.transform[0], it.transform[1]), w: it.width, font: fontName(it.fontName) }))
      .sort((m, n) => (Math.abs(m.y - n.y) > 2 ? m.y - n.y : m.x - n.x));
    let cur: StyledLine | null = null;
    for (const it of items) {
      const last: StyledLine | null = cur;
      const sameRow = last && Math.abs(it.y - last.y) <= 2.5;
      if (last && sameRow && it.x - last.xEnd < Math.max(it.size, last.sizePt) * 1.6) {
        last.text += (it.x - last.xEnd > it.size * 0.25 ? " " : "") + it.str;
        last.xEnd = Math.max(last.xEnd, it.x + it.w);
        if (it.size > last.sizePt) { last.sizePt = it.size; last.fontName = it.font; }
      } else {
        cur = { text: it.str, sizePt: it.size, bold: false, fontName: it.font, x: it.x, xEnd: it.x + it.w, y: it.y };
        lines.push(cur);
      }
    }
  }
  return buildDesign("pdf", pageW, pageH, lines, gfx);
}
