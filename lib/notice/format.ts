// 가정통신문 레퍼런스(학교가 실제로 보낸 통신문)의 "양식"을 분석한다.
// 내용(날짜·장소·이름)이 아니라 틀을 뽑는다: 머리말 구성, 인사말, 번호 체계, 항목 이름, 신청 방식, 맺음말.
// 규칙 기반이라 AI 없이도 동작하고, AI를 쓸 때도 이 분석 결과를 함께 넘겨 틀을 지키게 한다.
// 서버 전용 모듈이 아니어서 테스트에서 바로 불러 쓸 수 있다.

export type SectionKind = "overview" | "schedule" | "apply" | "cost" | "prep" | "safety" | "other";

export interface NoticeSection {
  no: number;
  title: string;
  kind: SectionKind;
  /** "가. 일시: …" 같은 하위 항목의 이름 (일시·장소·대상 …) */
  items: string[];
}
export interface NoticeBlock {
  title: string;
  bullets: number;
}
export interface NoticeFormat {
  /** 맨 위 학교 표어 줄이 있는가 */
  hasSlogan: boolean;
  /** "(인고 2026-106호)" 같은 문서번호 줄이 있는가 */
  hasDocNo: boolean;
  /** "담당자: ○○부 ☎ …" 줄이 있는가 */
  hasContact: boolean;
  /** "가 정 통 신 문" 처럼 글자 사이를 띄웠는가 */
  spacedTitle: boolean;
  greeting: string;
  /** 인사말 뒤 첫 번호 항목 전까지의 본문 글자 수 (길면 문단을 두 개로) */
  introChars: number;
  sections: NoticeSection[];
  /** "○ 학생 준비물" 같은 동그라미 블록 */
  blocks: NoticeBlock[];
  /** "* 일정은 변경될 수 있음", "※ …" 주석이 있는가 */
  hasNotes: boolean;
  /** 신청을 온라인(URL·QR)으로 받는가. false 면 종이 동의서(절취선) */
  online: boolean;
  /** 날짜 표기: dots "2026. 11. 4.(수)" / korean "2026년 11월 4일(수)" */
  dateStyle: "dots" | "korean";
  /** 맺음말 "인 천 고 등 학 교 장" 처럼 글자 사이를 띄웠는가 */
  spacedSchool: boolean;
  /** 화면에 보여줄 한 줄 요약들 */
  summary: string[];
}

export const KIND_LABEL: Record<SectionKind, string> = {
  overview: "개요", schedule: "일정", apply: "신청·제출", cost: "경비", prep: "준비물", safety: "안전·유의", other: "기타",
};

export function classifySection(title: string): SectionKind {
  if (/신청|접수|제출|동의|회신/.test(title)) return "apply";
  if (/경비|비용|납부|정산|예산/.test(title)) return "cost";
  if (/준비물|지참/.test(title)) return "prep";
  if (/안전|유의|주의|응급|금지/.test(title)) return "safety";
  if (/일정|계획|시간표|세부/.test(title)) return "schedule";
  if (/개요|안내|운영|실시|내용|목적/.test(title)) return "overview";
  return "other";
}

const SECTION_RE = /^(\d{1,2})\.\s*([가-힣].*)$/;
const ITEM_COLON_RE = /^([가-하])\.\s*([^:：]{1,20}?)\s*[:：]/;
const ITEM_PLAIN_RE = /^([가-하])\.\s*([^:：]{1,20})$/;
const BLOCK_RE = /^[○◦●]\s*(.+)$/;
const DOC_NO_RE = /^\(\s*\S+\s*\d{4}\s*-\s*\d+\s*호\s*\)\s*$/;

export function analyzeNoticeFormat(text: string): NoticeFormat {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);

  const titleIdx = lines.findIndex((l) => /^가\s*정\s*통\s*신\s*문/.test(l));
  const titleLine = titleIdx >= 0 ? lines[titleIdx] : "";
  const spacedTitle = /^가\s+정\s+통/.test(titleLine);
  const hasDocNo = lines.some((l) => DOC_NO_RE.test(l));
  const hasContact = lines.some((l) => /담당자?\s*[:：]/.test(l));

  // 표어: 통신문 제목 바로 앞 줄(문서번호 줄은 건너뜀)
  let hasSlogan = false;
  for (let i = titleIdx - 1; i >= 0 && titleIdx > 0; i--) {
    if (DOC_NO_RE.test(lines[i])) continue;
    hasSlogan = lines[i].length >= 4 && lines[i].length <= 40 && !/[:：]/.test(lines[i]);
    break;
  }

  const greetingLine = lines.find((l) => /기원합니다/.test(l)) ?? "";
  const greeting = greetingLine.replace(/\s+/g, " ").trim();

  // 번호 항목 "1. …" (1, 2, 3 … 순서대로인 것만 — "11. 4.(수)" 같은 날짜 줄은 한글로 시작하지 않아 제외)
  const sections: NoticeSection[] = [];
  const blocks: NoticeBlock[] = [];
  let firstSectionLine = -1;
  let curBlock: NoticeBlock | null = null;
  lines.forEach((l, i) => {
    const m = SECTION_RE.exec(l);
    if (m && Number(m[1]) === sections.length + 1) {
      const title = m[2].replace(/\s*[:：].*$/, "").trim();
      sections.push({ no: sections.length + 1, title, kind: classifySection(title), items: [] });
      if (firstSectionLine < 0) firstSectionLine = i;
      curBlock = null;
      return;
    }
    const b = BLOCK_RE.exec(l);
    if (b) { curBlock = { title: b[1].trim(), bullets: 0 }; blocks.push(curBlock); return; }
    if (curBlock && /^[-–·]\s*/.test(l)) { curBlock.bullets += 1; return; }
    const cur = sections[sections.length - 1];
    if (cur && !curBlock) {
      const it = ITEM_COLON_RE.exec(l) ?? ITEM_PLAIN_RE.exec(l);
      if (it) cur.items.push(it[2].trim());
    }
  });

  const startIntro = Math.max(titleIdx, lines.findIndex((l) => /^제목\s*[:：]/.test(l)));
  const introLines = firstSectionLine > startIntro ? lines.slice(startIntro + 1, firstSectionLine) : [];
  const introChars = introLines.filter((l) => !/^담당자?\s*[:：]/.test(l) && !DOC_NO_RE.test(l)).join("").length;

  const hasNotes = lines.some((l) => /^[*※]/.test(l));
  const online = lines.some((l) => /forms\.gle|https?:\/\/|큐알|QR|구글\s*폼|온라인\s*(접수|신청)/i.test(l));
  const dateStyle = lines.some((l) => /\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*\(/.test(l)) ? "dots" : "korean";
  const spacedSchool = lines.some((l) => /(?:[가-힣]\s){3,}[가-힣]\s*장\s*$/.test(l));

  const summary: string[] = [];
  summary.push(`머리말: ${[hasSlogan && "학교 표어", hasDocNo && "문서번호", spacedTitle ? "「가 정 통 신 문」(글자 띄움)" : "「가정통신문」", hasContact && "담당자·전화 줄"].filter(Boolean).join(" · ")}`);
  if (greeting) summary.push(`인사말: ${greeting.length > 40 ? `${greeting.slice(0, 40)}…` : greeting}`);
  if (sections.length) {
    summary.push(`번호 체계: 1. → ${sections.some((s) => s.items.length) ? "가. 나. 다." : "(하위 항목 없음)"}`);
    sections.forEach((s) => summary.push(`${s.no}. ${s.title} [${KIND_LABEL[s.kind]}]${s.items.length ? ` — ${s.items.join(" · ")}` : ""}`));
  } else {
    summary.push("번호 항목(1. 2. …)을 찾지 못했어요. 기본 구성으로 만들어요.");
  }
  if (blocks.length) summary.push(`○ 블록: ${blocks.map((b) => b.title).join(" · ")}`);
  summary.push(`신청 방식: ${online ? "온라인(URL·QR)" : "종이 동의서(절취선)"}`);
  summary.push(`날짜 표기: ${dateStyle === "dots" ? "2026. 11. 4.(수)" : "2026년 11월 4일(수)"} · 맺음말: 날짜 + 학교장${spacedSchool ? "(글자 띄움)" : ""}`);

  return { hasSlogan, hasDocNo, hasContact, spacedTitle, greeting, introChars, sections, blocks, hasNotes, online, dateStyle, spacedSchool, summary };
}

/** 레퍼런스에서 양식을 못 읽었을 때 쓰는 기본 구성 */
export const DEFAULT_FORMAT: NoticeFormat = {
  hasSlogan: false, hasDocNo: false, hasContact: true, spacedTitle: false,
  greeting: "학부모님 가정에 건강과 행복이 가득하시기를 기원합니다.",
  introChars: 220,
  sections: [], blocks: [], hasNotes: true, online: false, dateStyle: "dots", spacedSchool: false,
  summary: ["레퍼런스 없이 기본 구성으로 만들어요."],
};
