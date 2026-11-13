// DEMO_MODE 고정 답변. 인터넷이 끊기거나 API가 실패해도 발표 시나리오가 돌아가게 한다.
// 순서가 중요하다: 위에서부터 먼저 맞는 규칙을 쓴다.
// 작년·동의율·안전요원 질문은 질문 속 행사(detectEvent)를 찾아 그 행사 데이터로 답을 만든다 (LLM 없이 템플릿).
import { events as allEvents } from "../data";
import { formatDDay } from "../dates";
import { computeSchedule } from "../schedule";
import { SCHOOL } from "../school-info";
import type { ClientState, DateString, EventCard } from "../types";
import { EMPTY_CLIENT_STATE } from "../types";
import { detectEvent } from "./detect";
import { LEGAL_NOTE } from "./messages";

export type DemoKey = "liability" | "lastYear" | "record" | "consent" | "safetyStaff";

export interface DemoAnswer {
  key: DemoKey;
  match: RegExp;
  /** 행사를 특정하지 못했을 때(또는 E-07일 때) 쓰는 기존 시연용 고정 답 */
  answer: string;
  sourceIds: string[];
  /** true 면 질문 속 행사에 따라 답을 다시 만든다 */
  perEvent?: boolean;
}

/** 기존 시연 시나리오의 기본 행사 (2학년 수학여행) */
export const DEFAULT_EVENT_ID = "E-07";

export const DEMO_ANSWERS: DemoAnswer[] = [
  {
    key: "liability",
    match: /(면책|책임|사고 ?(나|가)|소송|처벌)/,
    answer:
      "현행 기준은 교사가 안전조치 의무를 다한 경우 책임을 면할 수 있다는 거예요(학교안전법). " +
      "'고의·중과실이 없으면 면책'하도록 바꾸는 개정안이 추진 중이지만 아직 국회 통과가 확인되지 않았어요. " +
      "그래서 지금은 현행 기준이 그대로 적용돼요.\n\n" +
      LEGAL_NOTE,
    sourceIds: ["G-NAT-02", "G-NAT-03", "C-02"],
  },
  {
    key: "lastYear",
    match: /(작년|전임|지난 ?해|예전).{0,12}(어떻게|뭐|무슨|문제|주의|했)/,
    answer:
      "작년 2학년 수학여행은 제주 2박 3일로 진행됐어요(176명). 전임 선생님이 꼭 남긴 건 두 가지예요. " +
      "① 사전답사 때 숙소 비상구 확인을 놓쳐 4월에 다시 확인했으니, 올해는 사전답사(3월 13일 마감) 때 비상구·동선을 사진으로 남기세요. " +
      "② 동의서 배부 전에 학부모 설명회를 먼저 하니 동의율이 86%까지 올랐대요.",
    sourceIds: ["E-07"],
    perEvent: true,
  },
  {
    key: "record",
    match: /(글자|자수|몇 ?자|특기사항|행동특성|종합의견|학생부|기재)/,
    answer:
      "2026학년도 기재요령부터 창체 진로활동 특기사항은 700자에서 500자로, 행동특성 및 종합의견은 500자에서 300자로 줄었어요(전 학년, 전국 공통). " +
      "작년 방식과 달라졌으니 담임 선생님께 학생부 입력을 안내할 때 올해 기준으로 알려 주세요.",
    sourceIds: ["G-NAT-01", "C-01"],
  },
  {
    key: "consent",
    match: /(동의율|동의서|동의|몇 ?%|퍼센트)/,
    answer:
      "인천광역시교육청 기준으로, 숙박형 수학여행은 학년 전체 학부모의 80% 이상이 동의해야 추진할 수 있어요. " +
      "2학년 수학여행 카드의 '학생·학부모 의견 수렴 / 동의서' 단계에서 동의율을 집계해 두세요. 카드에는 명단 말고 '동의율 82%'처럼 숫자만 남기면 돼요.",
    sourceIds: ["G-INC-01", "E-07"],
    perEvent: true,
  },
  {
    key: "safetyStaff",
    match: /(안전 ?요원|안전 ?인력|보조 ?인력|몇 ?명)/,
    answer:
      "인천광역시교육청 기준으로, 참가 학생이 100명 이상이면 학생 50명당 안전요원 1명을 배치해요. " +
      "2학년 수학여행은 180명이 참가하니 최소 4명이 필요해요.",
    sourceIds: ["G-INC-01", "E-07"],
    perEvent: true,
  },
];

export const NO_LAST_YEAR = "이 행사는 작년 기록이 없어요. 올해가 첫 해예요.";
export const NO_OFFICE_RULE = "이 행사에는 등록된 교육청 기준이 없어요. 학교 자체 계획을 따르세요.";

/** 질문이 어느 규칙에 걸리는지 (행사와 무관) */
export function findDemoAnswer(question: string): DemoAnswer | null {
  return DEMO_ANSWERS.find((d) => d.match.test(question)) ?? null;
}

export interface DemoResult {
  key: DemoKey;
  answer: string;
  sourceIds: string[];
  notFound: boolean;
  /** 답이 가리키는 행사 (없으면 행사 무관 질문) */
  eventId?: string;
}

const officeName = (office: string) => (office === "인천" ? SCHOOL.office : `${office} 교육청`);
/** "1학년 수련활동 (숙박형)" → "1학년 수련활동" */
const shortTitle = (t: string) => t.replace(/\(.*?\)/g, "").trim();
/** 받침에 따라 은/는 */
const eunNeun = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  const batchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return `${w}${batchim ? "은" : "는"}`;
};
const mmdd = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

function lastYearAnswer(ev: EventCard, today: DateString, state: ClientState): string {
  const ly = ev.lastYear;
  if (!ly) return NO_LAST_YEAR;
  const parts = [`작년(${ly.year}) ${ev.title}: ${ly.summary}`];
  const important = ev.handoverNotes.filter((n) => n.important).slice(0, 2);
  if (important.length) {
    const marks = ["①", "②"];
    parts.push(`전임 선생님이 꼭 남긴 건 ${important.map((n, i) => `${marks[i]} ${n.note}`).join(" ")}`);
  }
  const issues = computeSchedule(ev, today, state).filter((s) => s.lastYear?.hadIssue);
  if (issues.length) {
    parts.push(
      `작년에 문제가 있었던 단계는 ${issues.map((s) => `'${s.label}'(올해 마감 ${mmdd(s.dueDate)}, ${formatDDay(s.daysLeft)})`).join(", ")}이에요.`,
    );
  }
  return parts.join(" ");
}

function consentAnswer(ev: EventCard): { answer: string; notFound: boolean } {
  const r = ev.officeRules;
  if (!r?.consentRate) return { answer: NO_OFFICE_RULE, notFound: true };
  return {
    answer:
      `${officeName(r.office)} 기준으로, ${eunNeun(shortTitle(ev.title))} ${r.consentRate}의 동의가 있어야 추진할 수 있어요. ` +
      `행사 카드의 '학생·학부모 의견 수렴 / 동의서' 단계에서 동의율을 집계해 두세요. 카드에는 명단 말고 숫자만 남기면 돼요.`,
    notFound: false,
  };
}

function safetyStaffAnswer(ev: EventCard): { answer: string; notFound: boolean } {
  const r = ev.officeRules;
  if (!r?.safetyStaff) return { answer: NO_OFFICE_RULE, notFound: true };
  let need = "";
  const m = r.safetyStaff.match(/(\d+)명당\s*(\d+)명/);
  if (m && ev.participants) {
    const n = Math.ceil(ev.participants / Number(m[1])) * Number(m[2]);
    need = ` ${eunNeun(shortTitle(ev.title))} ${ev.participants}명이 참가하니 최소 ${n}명이 필요해요.`;
  }
  return { answer: `${officeName(r.office)} 기준으로, 안전요원은 ${r.safetyStaff}이에요.${need}`, notFound: false };
}

/**
 * 데모 모드 답 만들기.
 * - 행사와 무관한 질문(면책·학생부): 고정 답
 * - 작년·동의율·안전요원: 질문 속 행사 → 지금 열린 카드 → (없으면) 기존 수학여행 시나리오
 *   대상이 수학여행(E-07)이면 기존 시연 문장을 그대로 쓴다 (시연 답이 바뀌지 않도록)
 */
export function buildDemoAnswer(
  question: string,
  opts: { focusEventId?: string; today: DateString; state?: ClientState; events?: EventCard[] },
): DemoResult | null {
  const rule = findDemoAnswer(question);
  if (!rule) return null;
  const base: DemoResult = { key: rule.key, answer: rule.answer, sourceIds: rule.sourceIds, notFound: false };
  if (!rule.perEvent) return base;

  const events = opts.events ?? allEvents;
  const ev = detectEvent(question, events, opts.focusEventId);
  if (!ev || ev.id === DEFAULT_EVENT_ID) return { ...base, eventId: DEFAULT_EVENT_ID };

  const state = opts.state ?? EMPTY_CLIENT_STATE;
  if (rule.key === "lastYear") {
    const answer = lastYearAnswer(ev, opts.today, state);
    return { key: rule.key, answer, sourceIds: [ev.id], notFound: false, eventId: ev.id };
  }
  const r = rule.key === "consent" ? consentAnswer(ev) : safetyStaffAnswer(ev);
  const sourceIds = r.notFound ? [ev.id] : [ev.officeRules!.sourceId, ev.id];
  return { key: rule.key, answer: r.answer, sourceIds, notFound: r.notFound, eventId: ev.id };
}
