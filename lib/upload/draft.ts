// 결과보고서(마스킹된 텍스트) → 행사 카드 초안
import { z } from "zod";
import { isDateString } from "../dates";
import { maskPersonalInfo } from "../masking";
import { DRAFT_OUTPUT_SCHEMA, DRAFT_SYSTEM_PROMPT } from "../chat/prompt";
import type { EventCard, EventDraft } from "../types";
import { STEP_IDS } from "../types";

const RawDraft = z.object({
  title: z.string(),
  scope: z.enum(["교내", "교외"]),
  template: z.enum(["OUT_OVERNIGHT", "OUT_DAY", "IN_SCHOOL"]),
  eventDate: z.string(),
  steps: z.array(z.object({ stepId: z.enum(STEP_IDS), actualDate: z.string(), memo: z.string() })),
  cautions: z.array(z.string()),
  handoverNote: z.string(),
});

const dateOrNull = (s: string) => (isDateString(s) ? s : null);

export function normalizeDraft(raw: unknown): EventDraft {
  const d = RawDraft.parse(raw);
  // AI가 돌려준 글에도 개인정보가 섞였을 수 있으니 한 번 더 가린다
  const m = (s: string) => maskPersonalInfo(s).maskedText;
  return {
    title: m(d.title),
    scope: d.scope,
    template: d.template,
    eventDate: dateOrNull(d.eventDate),
    steps: d.steps.map((s) => ({ stepId: s.stepId, actualDate: dateOrNull(s.actualDate), memo: m(s.memo) })),
    cautions: d.cautions.map(m),
    handoverNote: m(d.handoverNote),
  };
}

/** DEMO_MODE 또는 API 실패 시 보여줄 고정 초안 */
export const DEMO_DRAFT: EventDraft = {
  title: "2학년 수학여행 (숙박형)",
  scope: "교외",
  template: "OUT_OVERNIGHT",
  eventDate: "2026-05-13",
  steps: [
    { stepId: "plan", actualDate: "2026-01-10", memo: "학교교육계획 반영" },
    { stepId: "consent", actualDate: "2026-02-12", memo: "동의율 86%" },
    { stepId: "vendor", actualDate: "2026-03-14", memo: "사전답사 실시, 숙소 비상구 확인이 늦어짐" },
    { stepId: "safety_staff", actualDate: "2026-04-13", memo: "안전요원 4명 배치" },
    { stepId: "safety_edu", actualDate: "2026-05-06", memo: "학생·교사 사전 안전교육" },
    { stepId: "execute", actualDate: "2026-05-13", memo: "" },
    { stepId: "report", actualDate: "2026-05-27", memo: "결과 보고·정산 완료" },
  ],
  cautions: ["사전답사 때 숙소 비상구·대피 동선을 먼저 확인하고 사진으로 남길 것", "버스 배차 확인은 전날 저녁에 한 번 더"],
  handoverNote: "내년엔 사전답사 체크리스트에 '숙소 비상구·동선 사진'을 맨 위에 두세요.",
};

/**
 * 사용자가 고친 초안을 내년도 행사 카드로 바꾼다 (프론트에서 저장 버튼 누를 때 호출).
 * 결과는 ClientState.addedEvents 에 넣으면 캘린더·대시보드에 나타난다.
 */
export function draftToEventCard(
  draft: EventDraft,
  opts: { id: string; nextEventDate: string; year: number; author?: string },
): EventCard {
  const notes = [draft.handoverNote, ...draft.cautions].filter((s) => s.trim());
  return {
    id: opts.id,
    department: "창의적체험활동부",
    schoolLevel: "high",
    title: draft.title,
    scope: draft.scope,
    eventDate: opts.nextEventDate,
    template: draft.template,
    handoverNotes: notes.map((note) => ({ year: opts.year, note, author: opts.author ?? "전임자" })),
    stepStatus: {},
    changeAlertIds: [],
    updatedBy: opts.author ?? "전임자",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export const DRAFT_SYSTEM = DRAFT_SYSTEM_PROMPT;
export const DRAFT_SCHEMA = DRAFT_OUTPUT_SCHEMA as unknown as Record<string, unknown>;
