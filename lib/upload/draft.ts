// 결과보고서(마스킹된 텍스트) → 행사 카드 초안
// 업로드 한 번으로 카드의 모든 탭(인수인계·예산·장소·담당 이력·진로·과목 + 고민 기록)을 채운다.
// 원칙: 문서에 없는 값은 지어내지 않는다 (null·빈 배열). 사람 이름·연락처는 다시 한 번 가린다.
import { z } from "zod";
import { addYears, diffDays, isDateString } from "../dates";
import { maskPersonalInfo } from "../masking";
import { DRAFT_OUTPUT_SCHEMA, DRAFT_SYSTEM_PROMPT } from "../chat/prompt";
import type {
  CustomStep,
  DraftBudget,
  DraftCandidate,
  DraftCareer,
  DraftExtras,
  DraftOwnerNote,
  DraftVenue,
  EventCard,
  EventDraft,
  HandoverNote,
  LastYearRecord,
} from "../types";
import { STEP_IDS } from "../types";

// ---- 기존 필드: 이 모양이 아니면 초안 실패 (→ 고정 초안으로 대체) ----
const CoreDraft = z.object({
  title: z.string(),
  scope: z.enum(["교내", "교외"]),
  template: z.enum(["OUT_OVERNIGHT", "OUT_DAY", "IN_SCHOOL"]),
  eventDate: z.string(),
  steps: z.array(z.object({ stepId: z.enum(STEP_IDS), actualDate: z.string(), memo: z.string() })),
  cautions: z.array(z.string()),
  handoverNote: z.string(),
});

// ---- 새 필드: 없거나 형식이 틀리면 null·빈 배열 (기존 초안이 깨지지 않게) ----
const money = z.number().finite().nonnegative().transform((n) => Math.round(n)).nullable().catch(null);
const BudgetZ = z.object({
  total: money,
  perStudent: money,
  sources: z.array(z.object({ type: z.string(), amount: money })).catch([]),
  items: z.array(z.object({ name: z.string(), amount: money })).catch([]),
  memo: z.string().catch(""),
});
const VenueZ = z.object({
  name: z.string(),
  type: z.string().catch(""),
  memo: z.string().catch(""),
  rating: z.number().int().min(1).max(5).nullable().catch(null),
});
const CandidateZ = z.object({
  kind: z.enum(["장소", "업체", "프로그램", "일정"]).catch("장소"),
  name: z.string(),
  chosen: z.boolean().catch(false),
  reason: z.string().catch(""),
});
const CustomStepZ = z.object({ label: z.string(), actualDate: z.string().catch(""), memo: z.string().catch("") });
const CareerZ = z.object({
  tracks: z.array(z.string()).catch([]),
  subjects: z.array(z.string()).catch([]),
  creativeArea: z.string().catch(""),
  target: z.string().catch(""),
});
const OwnerZ = z.object({ good: z.string().catch(""), problem: z.string().catch(""), nextYear: z.string().catch("") });

/** 배열 안에서 형식이 맞는 항목만 남긴다 */
function arrayOf<T>(schema: z.ZodType<T>, v: unknown): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const r = schema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}
function objectOf<T>(schema: z.ZodType<T>, v: unknown): T | null {
  if (v === null || v === undefined || typeof v !== "object") return null;
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
}

const dateOrNull = (s: string) => (isDateString(s) ? s : null);
const CAREER_TRACKS = ["인문", "사회", "교육", "공학", "자연", "의약", "예체능"];

export function normalizeDraft(raw: unknown): EventDraft {
  const d = CoreDraft.parse(raw);
  const r = (raw ?? {}) as Record<string, unknown>;
  // AI가 돌려준 글에도 개인정보가 섞였을 수 있으니 한 번 더 가린다
  const m = (s: string) => maskPersonalInfo(s).maskedText;
  const eventDate = dateOrNull(d.eventDate);

  const b = objectOf(BudgetZ, r.budget);
  const budget: DraftBudget | null =
    b && (b.total !== null || b.perStudent !== null || b.sources.length || b.items.length || b.memo.trim())
      ? {
          total: b.total,
          perStudent: b.perStudent,
          sources: b.sources.filter((x) => x.type.trim()).map((x) => ({ type: m(x.type), amount: x.amount })),
          items: b.items.filter((x) => x.name.trim()).map((x) => ({ name: m(x.name), amount: x.amount })),
          memo: m(b.memo),
        }
      : null;

  const venues: DraftVenue[] = arrayOf(VenueZ, r.venues)
    .filter((v) => v.name.trim())
    .map((v) => ({ name: m(v.name), type: m(v.type), memo: m(v.memo), rating: v.rating }));

  const candidates: DraftCandidate[] = arrayOf(CandidateZ, r.candidates)
    .filter((c) => c.name.trim())
    .map((c) => ({ kind: c.kind, name: m(c.name), chosen: c.chosen, reason: m(c.reason) }));

  const skipped = arrayOf(z.string(), r.skipped).filter((s) => s.trim()).map(m);

  // 템플릿에 없는 단계: 행사일과 실제 날짜의 차이로 마감(offsetDays)을 계산. 계산할 수 없으면 넣지 않는다(추측 금지)
  const customSteps: CustomStep[] = arrayOf(CustomStepZ, r.customSteps).flatMap((c, i) => {
    const actual = dateOrNull(c.actualDate);
    if (!c.label.trim() || !actual || !eventDate) return [];
    return [{ id: `custom-doc-${i + 1}` as const, label: m(c.label.trim()), offsetDays: diffDays(eventDate, actual), memo: m(c.memo) || undefined }];
  });

  const c = objectOf(CareerZ, r.career);
  const career: DraftCareer | null =
    c && (c.tracks.length || c.subjects.length || c.creativeArea.trim() || c.target.trim())
      ? { tracks: c.tracks.filter((t) => CAREER_TRACKS.includes(t)), subjects: c.subjects.map(m), creativeArea: m(c.creativeArea), target: m(c.target) }
      : null;

  const o = objectOf(OwnerZ, r.ownerNote);
  const ownerNote: DraftOwnerNote | null =
    o && (o.good.trim() || o.problem.trim() || o.nextYear.trim()) ? { good: m(o.good), problem: m(o.problem), nextYear: m(o.nextYear) } : null;

  return {
    title: m(d.title),
    scope: d.scope,
    template: d.template,
    eventDate,
    steps: d.steps.map((s) => ({ stepId: s.stepId, actualDate: dateOrNull(s.actualDate), memo: m(s.memo) })),
    cautions: d.cautions.map(m),
    handoverNote: m(d.handoverNote),
    budget,
    venues,
    candidates,
    skipped,
    customSteps,
    career,
    ownerNote,
  };
}

/**
 * DEMO_MODE 또는 API 실패 시 보여줄 고정 초안.
 * 캘린더에 없는 새 행사라 시연에서 업로드해도 기존 카드와 겹치지 않는다.
 * (샘플 문서: docs/sample-upload/2026_박람회견학_결과보고서.txt)
 */
export const DEMO_DRAFT: EventDraft = {
  title: "1학년 대학·직업 박람회 견학",
  scope: "교외",
  template: "OUT_DAY",
  eventDate: "2026-10-16",
  steps: [
    { stepId: "plan", actualDate: "2026-08-17", memo: "학교교육계획 반영, 1학년 전체 180명" },
    { stepId: "consent", actualDate: "2026-09-01", memo: "가정통신문 동의서 회수, 동의율 94%" },
    { stepId: "vendor", actualDate: "2026-09-16", memo: "버스 3대 계약, 박람회장 사전답사 1회" },
    { stepId: "safety_staff", actualDate: "2026-10-02", memo: "인솔 교사 9명 배치" },
    { stepId: "safety_edu", actualDate: "2026-10-12", memo: "이동·관람 안전교육" },
    { stepId: "execute", actualDate: "2026-10-16", memo: "진로 상담 부스 단체 이용" },
    { stepId: "report", actualDate: "2026-10-23", memo: "결과 보고·정산 완료" },
    { stepId: "record", actualDate: "2026-10-30", memo: "진로활동 특기사항 담임 안내" },
  ],
  cautions: [
    "박람회 단체 사전등록은 행사 30일 전에 마감되니 계획 단계에서 날짜부터 확인할 것",
    "인원 확정 후 버스 대수를 계약 전에 다시 계산할 것 (작년 1대 추가 계약)",
  ],
  handoverNote: "사전답사는 1회로 충분해요. 단체 사전등록 마감(D-30)만 놓치지 마세요.",
  budget: {
    total: 4800000,
    perStudent: 15000,
    sources: [
      { type: "학교회계", amount: 2100000 },
      { type: "수익자부담", amount: 2700000 },
    ],
    items: [
      { name: "교통(버스 3대)", amount: 2100000 },
      { name: "점심 도시락", amount: 1800000 },
      { name: "입장·체험", amount: 900000 },
    ],
    memo: "버스 2대로 계획했다가 인원 때문에 1대 추가(70만원)해 학교회계가 초과됨",
  },
  venues: [
    { name: "(가상) 한빛컨벤션센터 박람회장", type: "전시·박람회장", memo: "단체 입장 게이트가 따로 있음. 도시락 먹을 공간이 좁아 시간을 나눠 써야 함", rating: 4 },
  ],
  candidates: [
    { kind: "장소", name: "(가상) 한빛컨벤션센터 대학·직업 박람회", chosen: true, reason: "학교에서 40분, 진로 상담 부스 단체 신청 가능" },
    { kind: "장소", name: "(가상) 서울 진로체험 박람회", chosen: false, reason: "왕복 3시간이라 오후 수업 결손" },
    { kind: "프로그램", name: "(가상) 대학 연합 전공 체험 캠프", chosen: false, reason: "단체 예약 120명 상한이라 1학년 전체 참가 불가" },
  ],
  skipped: ["사전답사 2회 → 작년에 이용한 시설이라 1회로 충분"],
  customSteps: [
    { id: "custom-doc-1", label: "박람회 단체 사전등록", offsetDays: -30, memo: "박람회 사무국 온라인 접수, 120명 단위로 신청" },
  ],
  career: { tracks: ["공학", "사회", "교육"], subjects: ["진로와 직업", "통합사회"], creativeArea: "진로활동", target: "1학년 전체(180명)" },
  ownerNote: {
    good: "진로 상담 부스를 사전 신청해서 학생별 상담 시간을 확보했다",
    problem: "버스 1대를 추가 계약해 학교회계 예산을 넘겼다",
    nextYear: "인원 확정 후 버스 대수를 계약 전에 다시 계산하기",
  },
};

/**
 * 사용자가 고친 초안을 내년도 행사 카드로 바꾼다 (프론트에서 저장 버튼 누를 때 호출).
 * 결과는 ClientState.addedEvents 에 넣으면 캘린더·대시보드에 나타난다.
 * 카드에 들어가지 않는 나머지 탭 데이터는 draftExtras() 로 받아 프론트가 저장한다.
 */
export function draftToEventCard(
  draft: EventDraft,
  opts: { id: string; nextEventDate: string; year: number; author?: string },
): EventCard {
  const author = opts.author ?? "전임자";
  const notes: HandoverNote[] = [
    ...(draft.handoverNote.trim() ? [{ year: opts.year, note: draft.handoverNote.trim(), author }] : []),
    // 주의점은 다음 담당자가 "인수인계 받기"에서 꼭 보도록 important
    ...draft.cautions.filter((s) => s.trim()).map((note) => ({ year: opts.year, note: note.trim(), author, important: true })),
  ];
  // 단계별 실제 날짜·메모는 "작년 기록"으로 넘어간다 → 내년 체크리스트 각 단계 옆에 "작년엔 ~" 으로 보임
  const steps: LastYearRecord["steps"] = {};
  for (const s of draft.steps) steps[s.stepId] = { actualDate: s.actualDate, memo: s.memo || undefined };
  // 템플릿에 없는 단계는 카드의 추가 단계로 (작성자 표시)
  const customSteps: CustomStep[] = (draft.customSteps ?? [])
    .filter((c) => c.label.trim())
    .map((c) => ({ ...c, label: c.label.trim(), author: c.author ?? author }));
  return {
    id: opts.id,
    department: "창의적체험활동부",
    schoolLevel: "high",
    title: draft.title,
    scope: draft.scope,
    eventDate: opts.nextEventDate,
    template: draft.template,
    handoverNotes: notes,
    lastYear: {
      year: opts.year,
      eventDate: draft.eventDate ?? addYears(opts.nextEventDate, -1),
      owner: author,
      summary: draft.handoverNote.trim() || draft.cautions[0] || "",
      steps,
    },
    ...(customSteps.length ? { customSteps } : {}),
    stepStatus: {},
    changeAlertIds: [],
    updatedBy: opts.author ?? "전임자",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

/** 카드 밖 탭(예산·장소·고민 기록·진로·담당 이력)에 저장할 초안 데이터. 없으면 null·빈 배열 */
export function draftExtras(draft: EventDraft): DraftExtras {
  return {
    budget: draft.budget ?? null,
    venues: draft.venues ?? [],
    candidates: draft.candidates ?? [],
    skipped: draft.skipped ?? [],
    career: draft.career ?? null,
    ownerNote: draft.ownerNote ?? null,
  };
}

export const DRAFT_SYSTEM = DRAFT_SYSTEM_PROMPT;
export const DRAFT_SCHEMA = DRAFT_OUTPUT_SCHEMA as unknown as Record<string, unknown>;
