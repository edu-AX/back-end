// 행사 정보(facts) + 레퍼런스 양식(NoticeFormat) → 양식에 맞는 가정통신문 초안.
// AI 없이도 레퍼런스의 머리말·번호 체계·항목 이름·신청 방식·날짜 표기·맺음말을 그대로 따른다.
// 행사 카드에 없는 값은 【   】 빈칸으로 남긴다. 서버 전용 모듈이 아니다(테스트에서 바로 사용).
import { DEFAULT_FORMAT, type NoticeFormat, type NoticeSection, type SectionKind } from "./format";

export type NoticeKind = "consent" | "settlement";

export interface NoticeFacts {
  schoolName: string; // 예: "인덕고등학교" — 레퍼런스 학교 이름은 쓰지 않는다
  year: string; // "2027"
  eventTitle: string;
  scope: "교내" | "교외";
  eventDate: string; // YYYY-MM-DD
  nights: string; // "2박 3일" | "당일" | ""
  venueText: string;
  targetText: string;
  participants: number | null;
  costPerStudent: number | null;
  costItems: string[];
  safetyStaff: string;
  safetyEduDate: string | null;
  consentDue: string | null; // 이미 지난 날짜는 프론트에서 null 로 보낸다
  today: string;
  discloseDue: string | null;
  settlement?: { income: string; items: { name: string; planned: string }[] };
}

export const BLANK = "【   】";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDate(iso: string | null | undefined, style: "dots" | "korean"): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return BLANK;
  const d = new Date(`${iso}T00:00:00Z`);
  const [y, m, day, w] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), DOW[d.getUTCDay()]];
  return style === "dots" ? `${y}. ${m}. ${day}.(${w})` : `${y}년 ${m}월 ${day}일(${w})`;
}
const spaced = (s: string) => [...s].join(" ");
const won = (n: number) => `${n.toLocaleString()}원`;

const DEFAULT_TITLE: Record<SectionKind, { consent: string; settlement: string }> = {
  overview: { consent: "행사 개요", settlement: "행사 개요" },
  schedule: { consent: "세부 일정", settlement: "세부 일정" },
  apply: { consent: "참가 신청 안내", settlement: "문의 및 안내" },
  cost: { consent: "경비 안내", settlement: "경비 정산 결과" },
  prep: { consent: "준비물", settlement: "준비물" },
  safety: { consent: "안전 대책", settlement: "안전 대책" },
  other: { consent: "기타 안내", settlement: "기타 안내" },
};
/** 레퍼런스 항목 제목이 "개요·안내·일정" 같은 일반 이름이면 그대로, 행사 고유 이름이면 기본 이름으로 */
function sectionTitle(s: NoticeSection, kind: NoticeKind): string {
  const generic = s.title.length <= (s.kind === "other" ? 10 : 14) && !/\d/.test(s.title);
  // "프로그램" 같은 레퍼런스 행사 고유 말투는 행사로 바꾼다
  return generic ? s.title.replace(/프로그램/g, "행사") : DEFAULT_TITLE[s.kind][kind];
}

const ITEM_LABELS: Record<SectionKind, string[]> = {
  overview: ["일시", "장소", "대상"],
  schedule: [], apply: [], cost: [], prep: [], safety: [], other: [],
};

function itemValue(label: string, f: NoticeFacts, fmt: NoticeFormat): string {
  const date = formatDate(f.eventDate, fmt.dateStyle);
  if (/일시|기간|날짜|일정/.test(label)) return `${date}${f.nights ? ` ${f.nights}` : ""}`;
  if (/장소|위치|목적지/.test(label)) return f.venueText || BLANK;
  if (/대상|참가자|참여/.test(label)) return `${f.targetText || BLANK}${f.participants ? `(${f.participants}명)` : ""}`;
  if (/경비|비용|참가비/.test(label)) return f.costPerStudent ? `학생 1인당 ${won(f.costPerStudent)}` : BLANK;
  if (/인원/.test(label)) return f.participants ? `${f.participants}명` : BLANK;
  if (/기한|마감|제출일/.test(label)) return formatDate(f.consentDue, fmt.dateStyle);
  return BLANK;
}

function body(kind: SectionKind, s: NoticeSection, f: NoticeFacts, fmt: NoticeFormat, mode: NoticeKind): string[] {
  const labels = (a: string[]) => a.map((l, i) => `  ${"가나다라마바사아자차카타파하"[i]}. ${l}: ${itemValue(l, f, fmt)}`);
  switch (kind) {
    case "overview": {
      const items = s.items.length ? s.items : ITEM_LABELS.overview;
      const extra = !items.some((l) => /경비|비용/.test(l)) && f.costPerStudent && f.scope === "교외" ? ["경비"] : [];
      return labels([...items, ...extra]);
    }
    case "schedule":
      return [`  일정 | 세부 내용 | 비고`, `  ${formatDate(f.eventDate, fmt.dateStyle)} | ${BLANK} | ${BLANK}`];
    case "apply":
      if (mode === "settlement") return [`  가. 문의: ${f.schoolName} ${BLANK}부 ☎ ${BLANK}`];
      return fmt.online
        ? ["  가. 신청 방법: 온라인 접수", `  나. 신청 주소(URL): ${BLANK}`, `  다. 신청 기한: ${formatDate(f.consentDue, fmt.dateStyle)}`]
        : ["  가. 제출 서류: 참가 동의서(아래 절취선 아래 양식)", `  나. 제출 기한: ${formatDate(f.consentDue, fmt.dateStyle)}`, "  다. 제출처: 담임교사"];
    case "cost":
      if (mode === "settlement" && f.settlement)
        return [
          `  가. 수익자 부담 경비: 1인당 ${f.costPerStudent ? won(f.costPerStudent) : BLANK}`,
          `  나. 총 수입: ${f.settlement.income}`,
          `  다. 총 집행액: ${BLANK}원 (잔액 ${BLANK}원, 1인당 환불액 ${BLANK}원)`,
          ...f.settlement.items.map((it) => `  - ${it.name}: 편성 ${it.planned} / 집행 ${BLANK}원`),
          `  라. 정산 내용은 ${formatDate(f.discloseDue, fmt.dateStyle)}까지 학교 홈페이지에 게시합니다.`,
        ];
      return [`  가. 학생 1인당 ${f.costPerStudent ? `${won(f.costPerStudent)} (수익자 부담)` : `${BLANK}원`}`, `  나. 포함 내역: ${f.costItems.join(", ") || BLANK}`];
    case "safety":
      return [`  - 인솔 교사·안전요원: ${f.safetyStaff ? `${f.safetyStaff} 기준으로 배치` : `${BLANK}명 배치`}`, `  - 사전 안전교육: ${formatDate(f.safetyEduDate, fmt.dateStyle)}`, `  - 비상 연락: ${f.schoolName} ${BLANK}부 ☎ ${BLANK}`];
    case "prep":
      return [`  - ${BLANK}`, `  - ${BLANK}`];
    default:
      return s.items.length ? s.items.map((l, i) => `  ${"가나다라마바사아자차카타파하"[i]}. ${l}: ${BLANK}`) : [`  - ${BLANK}`];
  }
}

export function composeNotice(mode: NoticeKind, f: NoticeFacts, format: NoticeFormat | null): string {
  const fmt = format ?? DEFAULT_FORMAT;
  const L: string[] = [];

  // 머리말
  if (fmt.hasSlogan) L.push(`【학교 표어】`);
  if (fmt.hasDocNo) L.push(`(【문서번호】호)`);
  L.push(fmt.spacedTitle ? "가 정 통 신 문" : "가정통신문");
  if (fmt.hasContact) L.push(`담당자: ${BLANK}부 ☎ ${BLANK}`);
  const suffix = mode === "settlement" ? "경비 정산 안내" : fmt.online ? "안내" : "안내 및 참가 동의서";
  L.push(`제목: ${f.year}학년도 ${f.eventTitle} ${suffix}`);

  // 인사말·본문
  L.push(`  ${fmt.greeting || DEFAULT_FORMAT.greeting}`);
  const action = f.scope === "교외" ? "실시" : "운영";
  if (mode === "settlement") {
    L.push(`  「${f.eventTitle}」에 사용한 경비의 정산 결과를 아래와 같이 안내해 드립니다.`);
  } else {
    L.push(`  본교에서는 ${f.targetText || BLANK} 학생을 대상으로 「${f.year}학년도 ${f.eventTitle}」을(를) ${action}하고자 합니다.`);
    if (fmt.introChars > 200) L.push(`  참가를 희망하는 학생과 학부모님께서는 아래 내용을 확인하시고, 안내된 기한까지 ${fmt.online ? "신청" : "동의서를 제출"}해 주시기 바랍니다.`);
  }

  // 번호 항목: 레퍼런스의 구성을 따르되, 꼭 필요한 항목(개요·신청/경비)은 없으면 채워 넣는다
  let secs: { title: string; kind: SectionKind; s: NoticeSection }[] = fmt.sections.map((s) => ({ title: sectionTitle(s, mode), kind: s.kind, s }));
  const others = secs.filter((x) => x.kind === "other");
  secs = [...secs.filter((x) => x.kind !== "other"), ...others.slice(0, 2)];
  // 정산 안내에는 개요·경비·문의만 남긴다 (준비물·안전·일정 같은 행사 안내 항목은 뺀다)
  if (mode === "settlement") secs = secs.filter((x) => x.kind === "overview" || x.kind === "cost" || x.kind === "apply");
  const has = (k: SectionKind) => secs.some((x) => x.kind === k);
  const mk = (k: SectionKind): { title: string; kind: SectionKind; s: NoticeSection } => ({ title: DEFAULT_TITLE[k][mode], kind: k, s: { no: 0, title: DEFAULT_TITLE[k][mode], kind: k, items: [] } });
  if (!has("overview")) secs.unshift(mk("overview"));
  if (mode === "settlement" && !has("cost")) secs.push(mk("cost"));
  if (mode === "consent" && f.scope === "교외" && f.costPerStudent && !has("cost")) secs.push(mk("cost"));
  if (mode === "consent" && f.scope === "교외" && !has("safety")) secs.push(mk("safety"));
  if (!has("apply")) secs.push(mk("apply"));
  // 신청·제출은 항상 마지막 번호 항목
  secs.sort((a, b) => Number(a.kind === "apply") - Number(b.kind === "apply"));

  L.push("");
  secs.forEach((x, i) => {
    L.push(`${i + 1}. ${x.title}`);
    L.push(...body(x.kind, x.s, f, fmt, mode));
  });
  if (fmt.hasNotes && mode === "consent") L.push("", "  * 일정 및 내용은 학교 사정에 따라 변경될 수 있음");

  // ○ 블록 (준비물·유의사항 등): 제목만 레퍼런스에서 따오고 내용은 빈칸
  for (const b of mode === "consent" ? fmt.blocks.slice(0, 4) : []) {
    L.push("", `○ ${b.title}`);
    for (let i = 0; i < Math.max(1, Math.min(b.bullets, 3)); i++) L.push(`  - ${BLANK}`);
  }

  // 맺음말
  L.push("", formatDate(f.today, "korean").replace(/\(.\)$/, ""), fmt.spacedSchool ? spaced(`${f.schoolName}장`) : `${f.schoolName}장`);

  // 종이 동의서 (온라인 신청이 아닌 레퍼런스일 때)
  if (mode === "consent" && !fmt.online) {
    L.push(
      "", "- - - - - - - - - - - - - - - 절 취 선 - - - - - - - - - - - - - - -", "",
      `${f.eventTitle} 참가 동의서`, "",
      `  학년 반 번호 이름: ${BLANK}학년 ${BLANK}반 ${BLANK}번 (이름: ${BLANK})`,
      "  건강상 알려야 할 사항(알레르기·지병 등): ", "",
      "  위 학생이 행사에 참가하는 것에  □ 동의합니다   □ 동의하지 않습니다", "",
      `  ${f.year}년 ${BLANK}월 ${BLANK}일`, `  학부모(보호자): ${BLANK} (서명 또는 인)`,
    );
  }
  return L.join("\n");
}
