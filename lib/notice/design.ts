// 가정통신문 레퍼런스의 "디자인"을 뽑아 DesignProfile 로 정리한다.
// 양식(format.ts)이 글의 구성이라면, 디자인은 보이는 모양이다: 용지·여백, 글꼴·크기, 머리말 상자(로고·엠블럼·큰 제목·회색 줄),
// 표 머리 색, 맺음말 크기. PDF(pdfdesign.ts)와 한글(hwpdesign.ts)에서 각각 글줄·도형·그림을 읽어 오고,
// 이 파일의 buildDesign 이 둘을 같은 규칙으로 DesignProfile 로 바꾼다.
// 서버 전용 모듈이 아니어서 테스트에서 바로 불러 쓸 수 있다.

export interface FontSpec {
  /** CSS font-family 목록 (한글 문서 글꼴 → 웹에서 쓸 수 있는 대체 글꼴 순서) */
  family: string;
  bold: boolean;
  /** 레퍼런스에서 읽은 원래 글꼴 이름 (화면 요약용) */
  original: string;
}

export interface DesignProfile {
  source: "pdf" | "hwp" | "default";
  pageMm: [number, number];
  marginMm: { top: number; right: number; bottom: number; left: number };
  /** 쪽 전체를 두른 테두리가 있는가 */
  pageBorder: boolean;
  fonts: { body: FontSpec; title: FontSpec; subject: FontSpec; heading: FontSpec; meta: FontSpec; closing: FontSpec };
  /** 글자 크기(pt) */
  sizes: { body: number; title: number; subject: number; heading: number; meta: number; slogan: number; note: number; closingDate: number; closingSchool: number };
  /** 본문 줄 간격(글자 크기의 몇 배) */
  lineHeight: number;
  header: {
    /** 머리말을 선으로 두른 상자로 그리는가 */
    boxed: boolean;
    /** 큰 제목 왼쪽에 엠블럼(학교 마크)을 두는가 */
    emblem: boolean;
    /** 제목 아래 회색 줄 색 (없으면 null) */
    grayBar: string | null;
    subjectBoxed: boolean;
    titleAlign: "center" | "left";
  };
  table: { headerFill: string | null; borderPt: number; fontPt: number };
  closing: { dateBold: boolean; schoolBold: boolean; align: "center" | "right" };
  /** 레퍼런스에 들어 있던 그림 (data URL). logo: 맨 위 가로로 긴 그림(교표·글씨 로고), emblem: 정사각형에 가까운 학교 마크 */
  images: { logo?: string; emblem?: string };
  /** 화면에 보여줄 요약 */
  summary: string[];
}

/** 한 줄(또는 한 덩어리)의 글자와 그 모양. 좌표는 쪽 왼쪽 위 기준 pt */
export interface StyledLine {
  text: string;
  sizePt: number;
  bold: boolean;
  fontName: string;
  x: number;
  xEnd: number;
  y: number;
  color?: string;
}
export interface Graphics {
  fills: { x: number; y: number; w: number; h: number; color: string }[];
  strokes: { x: number; y: number; w: number; h: number; width: number }[];
  images: { x: number; y: number; w: number; h: number; dataUrl?: string }[];
  /** 표가 있었는가 (한글 문서처럼 도형 정보 없이 표 유무만 알 때) */
  hasTable?: boolean;
}

const PT_TO_MM = 25.4 / 72;
const mm = (pt: number) => Math.round(pt * PT_TO_MM * 10) / 10;

const SANS = `"함초롬돋움","HCR Dotum","Malgun Gothic","맑은 고딕","Noto Sans KR",sans-serif`;
const SERIF = `"함초롬바탕","HCR Batang","Batang","바탕","Noto Serif KR",serif`;
const HEADLINE = `"HY헤드라인M","Malgun Gothic","맑은 고딕","Noto Sans KR",sans-serif`;

export function fontSpec(fontName: string, boldHint = false): FontSpec {
  const n = fontName.replace(/^[A-Z]{6}\+/, "");
  const bold = boldHint || /bold|bd\b|heavy|black|hdr|headline|헤드라인|(?:^|[^a-z])b$/i.test(n);
  let family = SANS;
  if (/hdr|headline|헤드라인/i.test(n)) family = HEADLINE;
  else if (/batang|myeongjo|gungsuh|명조|바탕|dnk/i.test(n)) family = SERIF;
  return { family, bold, original: n || "알 수 없음" };
}

const hexToRgb = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};
const isGray = (c: string) => {
  const rgb = hexToRgb(c);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return Math.max(r, g, b) - Math.min(r, g, b) < 24 && r > 90 && r < 245; // 검정·흰색이 아닌 회색
};
const isTinted = (c: string) => {
  const rgb = hexToRgb(c);
  return !!rgb && Math.min(...rgb) < 245 && Math.max(...rgb) > 40; // 흰색·거의 검정이 아닌 색
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const mode = <T,>(xs: T[], fallback: T): T => {
  const m = new Map<T, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
};

export function defaultDesign(): DesignProfile {
  const sans = fontSpec("HCRDotum");
  return {
    source: "default", pageMm: [210, 297], marginMm: { top: 15, right: 20, bottom: 15, left: 20 }, pageBorder: false,
    fonts: { body: sans, title: { ...sans, bold: true }, subject: sans, heading: { ...sans, bold: true }, meta: sans, closing: { ...sans, bold: true } },
    sizes: { body: 11, title: 28, subject: 12, heading: 11, meta: 9, slogan: 10, note: 9, closingDate: 13, closingSchool: 20 },
    lineHeight: 1.6,
    header: { boxed: true, emblem: false, grayBar: "#b2b2b2", subjectBoxed: false, titleAlign: "center" },
    table: { headerFill: "#d9d9d9", borderPt: 0.7, fontPt: 10 },
    closing: { dateBold: true, schoolBold: true, align: "center" },
    images: {},
    summary: ["레퍼런스 없이 기본 디자인(머리말 상자·회색 줄·표 머리 회색)으로 그려요."],
  };
}

const TITLE_RE = /가\s*정\s*통\s*신\s*문/;
const DATE_RE = /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*$/;
const SCHOOL_RE = /(?:[가-힣]\s){3,}[가-힣]\s*장\s*$|[가-힣]{2,}(?:초|중|고등)학교장\s*$/;

/** 글줄(StyledLine)·도형·그림 → DesignProfile */
export function buildDesign(source: "pdf" | "hwp", pageW: number, pageH: number, lines: StyledLine[], gfx: Graphics): DesignProfile {
  const base = defaultDesign();
  const real = lines.filter((l) => l.text.trim());
  if (real.length === 0) return { ...base, source, summary: ["글줄을 읽지 못해 기본 디자인으로 그려요."] };

  const find = (re: RegExp) => real.find((l) => re.test(l.text));
  const title = find(TITLE_RE);
  const subject = find(/^제목\s*[:：]/);
  const meta = find(/담당자?\s*[:：]/);
  const greeting = find(/기원합니다/);
  const longs = real.filter((l) => l.text.replace(/\s/g, "").length > 18 && !/^제목/.test(l.text));
  const bodySize = mode(longs.map((l) => Math.round(l.sizePt * 2) / 2), 11);
  const bodyLine = longs.find((l) => Math.round(l.sizePt * 2) / 2 === bodySize) ?? real[0];
  const heading = real.find((l) => /^\d{1,2}\.\s*[가-힣]/.test(l.text.trim()));
  const note = real.find((l) => /^[*※]/.test(l.text.trim()));
  const dateLine = [...real].reverse().find((l) => DATE_RE.test(l.text.trim()));
  const schoolLine = [...real].reverse().find((l) => SCHOOL_RE.test(l.text.trim()));
  const slogan = (() => {
    if (!title) return undefined;
    return real.filter((l) => l.y < title.y - 4 && l !== title && l.sizePt < title.sizePt * 0.6).sort((a, b) => b.y - a.y)[0];
  })();

  // 본문 영역(왼쪽·오른쪽 끝)과 위·아래 여백
  const bodyLines = longs.length ? longs : real;
  const left = Math.min(...bodyLines.map((l) => l.x));
  const right = Math.max(...bodyLines.map((l) => l.xEnd));
  const top = Math.min(...real.map((l) => l.y));
  const bottom = pageH - Math.max(...real.map((l) => l.y));
  const bodyFont = fontSpec(bodyLine.fontName, bodyLine.bold);
  const f = (l: StyledLine | undefined, fallback: FontSpec) => (l ? fontSpec(l.fontName, l.bold) : fallback);

  // 줄 간격: 본문 줄들의 y 차이 중앙값 ÷ 글자 크기
  const ys = [...new Set(longs.filter((l) => Math.abs(l.sizePt - bodySize) < 0.6).map((l) => Math.round(l.y * 10) / 10))].sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > bodySize * 0.8 && g < bodySize * 3);
  const lineHeight = gaps.length ? Math.round((median(gaps) / bodySize) * 20) / 20 : base.lineHeight;

  // 도형: 쪽 테두리·머리말 상자·회색 줄·표 머리 색
  const contentW = Math.max(right - left, pageW * 0.5);
  // 쪽 테두리: 쪽 거의 전체를 두른 사각형이거나, 쪽 가장자리의 긴 세로선 둘 + 가로선 둘
  const tallV = gfx.strokes.filter((s) => s.w < 3 && s.h >= pageH * 0.75);
  const wideH = gfx.strokes.filter((s) => s.h < 3 && s.w >= pageW * 0.75);
  const pageBorder = gfx.strokes.some((s) => s.w >= pageW * 0.8 && s.h >= pageH * 0.8) || (tallV.length >= 2 && wideH.length >= 2);
  const headerBottom = (subject ?? greeting)?.y ?? pageH * 0.3;
  const wideLinesAboveBody = gfx.strokes.filter((s) => s.h < 2 && s.w >= contentW * 0.8 && s.y < headerBottom + 14);
  const boxed = wideLinesAboveBody.length >= 2;
  const grayBar = gfx.fills
    .filter((r) => r.h > 1 && r.h <= 14 && r.w >= contentW * 0.4 && isGray(r.color) && (!title || (r.y > title.y - 10 && r.y < headerBottom + 12)))
    .map((r) => r.color)[0] ?? null;
  const tableFills = gfx.fills.filter((r) => r.h >= 10 && r.h <= 40 && r.w >= 25 && isTinted(r.color) && r.y > headerBottom + 10);
  const headerFill = tableFills.length ? mode(tableFills.map((r) => r.color.toLowerCase()), null as string | null) : gfx.hasTable ? "#d9d9d9" : null;
  const thin = gfx.strokes.filter((s) => (s.h < 2 || s.w < 2) && s.width > 0).map((s) => Math.round(s.width * 10) / 10);
  const borderPt = thin.length ? Math.max(0.5, Math.min(1.5, mode(thin, 0.7))) : base.table.borderPt;
  const subjectBoxed = !!subject && gfx.strokes.some((s) => s.h < 2 && s.w >= contentW * 0.8 && Math.abs(s.y - (subject.y + subject.sizePt * 0.7)) < 14);

  // 그림: 큰 제목 왼쪽의 정사각형에 가까운 것 = 엠블럼, 맨 위 가로로 긴 것 = 로고
  const imgs = gfx.images.filter((i) => i.dataUrl);
  const emblemImg = imgs.find((i) => title && i.x < title.x && Math.abs(i.w / i.h - 1) < 0.5 && i.h > 20 && i.y > (slogan?.y ?? 0) - 2);
  const logoImg = imgs.find((i) => i !== emblemImg && i.w / i.h > 2 && i.y < (title?.y ?? pageH * 0.2));
  const emblemSlot = !!title && (!!emblemImg || gfx.images.some((i) => i.x < title.x - 10 && Math.abs(i.w / i.h - 1) < 0.5 && i.h > 20));

  const titleCenter = title ? (title.x + title.xEnd) / 2 : pageW / 2;
  const titleAlign = title && Math.abs(titleCenter - pageW / 2) < pageW * 0.12 + (emblemSlot ? pageW * 0.1 : 0) ? "center" : "left";
  const dateCenter = dateLine ? (dateLine.x + dateLine.xEnd) / 2 : pageW / 2;

  const design: DesignProfile = {
    source,
    pageMm: [mm(pageW), mm(pageH)],
    marginMm: { top: Math.max(8, mm(top - 4)), right: Math.max(10, mm(pageW - right)), bottom: Math.max(8, mm(bottom - 4)), left: Math.max(10, mm(left)) },
    pageBorder,
    fonts: {
      body: bodyFont, title: f(title, { ...bodyFont, bold: true }), subject: f(subject, bodyFont), heading: f(heading, { ...bodyFont, bold: true }),
      meta: f(meta, bodyFont), closing: f(dateLine ?? schoolLine, { ...bodyFont, bold: true }),
    },
    sizes: {
      body: bodySize, title: title ? Math.round(title.sizePt) : base.sizes.title, subject: subject ? Math.round(subject.sizePt * 2) / 2 : base.sizes.subject,
      heading: heading ? Math.round(heading.sizePt * 2) / 2 : bodySize, meta: meta ? Math.round(meta.sizePt * 2) / 2 : base.sizes.meta,
      slogan: slogan ? Math.round(slogan.sizePt * 2) / 2 : base.sizes.slogan, note: note ? Math.round(note.sizePt * 2) / 2 : base.sizes.note,
      closingDate: dateLine ? Math.round(dateLine.sizePt) : base.sizes.closingDate, closingSchool: schoolLine ? Math.round(schoolLine.sizePt) : base.sizes.closingSchool,
    },
    lineHeight,
    header: { boxed, emblem: emblemSlot, grayBar, subjectBoxed, titleAlign },
    table: { headerFill, borderPt, fontPt: Math.max(8, Math.min(bodySize, bodySize - 0.5)) },
    closing: { dateBold: !!dateLine?.bold || (dateLine ? dateLine.sizePt >= bodySize + 1 : true), schoolBold: true, align: Math.abs(dateCenter - pageW / 2) < pageW * 0.1 ? "center" : "right" },
    images: { ...(logoImg?.dataUrl ? { logo: logoImg.dataUrl } : {}), ...(emblemImg?.dataUrl ? { emblem: emblemImg.dataUrl } : {}) },
    summary: [],
  };

  const s = design.sizes;
  design.summary = [
    `용지: A4 ${design.pageMm[0] === 210 ? "" : `(${design.pageMm[0]}×${design.pageMm[1]}mm) `}· 여백 위 ${design.marginMm.top} 좌 ${design.marginMm.left} 우 ${design.marginMm.right}mm${pageBorder ? " · 쪽 테두리 있음" : ""}`,
    `본문: ${design.fonts.body.original} ${s.body}pt · 줄 간격 ${design.lineHeight}배`,
    `머리말: ${boxed ? "선으로 두른 상자" : "상자 없음"}${emblemSlot ? " · 제목 왼쪽에 엠블럼" : ""}${logoImg ? " · 위쪽 로고" : ""}${grayBar ? ` · 제목 아래 회색 줄(${grayBar})` : ""}`,
    `큰 제목 「가정통신문」: ${design.fonts.title.original} ${s.title}pt${design.fonts.title.bold ? " 굵게" : ""} · ${titleAlign === "center" ? "가운데" : "왼쪽"}`,
    `항목 제목: ${design.fonts.heading.original} ${s.heading}pt${design.fonts.heading.bold ? " 굵게" : ""} · 주석 ${s.note}pt`,
    `표: ${headerFill ? `머리 칸 ${headerFill}` : "머리 칸 색 없음"} · 선 ${borderPt}pt`,
    `맺음말: 날짜 ${s.closingDate}pt · 학교장 ${s.closingSchool}pt · ${design.closing.align === "center" ? "가운데" : "오른쪽"}`,
  ];
  return design;
}
