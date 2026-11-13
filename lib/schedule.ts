// D-day 역산: 행사일 + 템플릿 → 단계별 마감일
import { changes as allChanges, getTemplate } from "./data";
import { addDays, diffDays } from "./dates";
import type {
  AnyStepId,
  ChangeAlert,
  ClientState,
  DateString,
  EventCard,
  HandoverNote,
  ScheduledStep,
  StepId,
  StepState,
  Template,
} from "./types";
import { EMPTY_CLIENT_STATE, isCustomStepId } from "./types";

/** 화면에서 바꾼 행사일이 있으면 그걸 쓴다 */
export function effectiveEventDate(event: EventCard, state: ClientState = EMPTY_CLIENT_STATE): DateString {
  return state.eventDateOverrides[event.id] ?? event.eventDate;
}

/** 단계 상태: localStorage 값 > events.json 기본값 > "todo" */
export function stepState(event: EventCard, stepId: AnyStepId, state: ClientState): StepState {
  return state.stepStatus[event.id]?.[stepId] ?? event.stepStatus[stepId] ?? "todo";
}

/** 마감 계산 전의 단계 정의 (템플릿 + 추가 단계, 수정·숨김 반영) */
export interface StepDef {
  id: AnyStepId;
  label: string;
  offsetDays: number;
  /** 템플릿 원래 마감 (작년보다 늦었는지 비교용) */
  templateOffset?: number;
  isCustom: boolean;
  author?: string;
  memo?: string;
  edited: boolean;
}

/**
 * 이 행사의 단계 목록:
 * 템플릿 단계 + event.customSteps(업로드·전임자) + state.customSteps(내가 추가)
 * → state.stepEdits 로 이름·마감 덮어쓰기 → state.hiddenSteps 빼기 → 마감(offset) 순 정렬
 */
export function stepsOf(
  event: EventCard,
  state: ClientState = EMPTY_CLIENT_STATE,
  template: Template = getTemplate(event.template),
): StepDef[] {
  const hidden = new Set(state.hiddenSteps?.[event.id] ?? []);
  const edits = state.stepEdits?.[event.id] ?? {};
  const base: StepDef[] = [
    ...template.steps.map((s) => ({ id: s.id, label: s.label, offsetDays: s.offsetDays, templateOffset: s.offsetDays, isCustom: false, edited: false })),
    ...[...(event.customSteps ?? []), ...(state.customSteps?.[event.id] ?? [])].map((c) => ({
      id: c.id,
      label: c.label,
      offsetDays: c.offsetDays,
      isCustom: true,
      author: c.author,
      memo: c.memo,
      edited: false,
    })),
  ];
  const seen = new Set<string>();
  return base
    .filter((s) => !hidden.has(s.id) && !seen.has(s.id) && (seen.add(s.id), true))
    .map((s) => {
      const e = edits[s.id];
      if (!e) return s;
      return {
        ...s,
        label: e.label?.trim() ? e.label.trim() : s.label,
        offsetDays: typeof e.offsetDays === "number" && Number.isFinite(e.offsetDays) ? e.offsetDays : s.offsetDays,
        edited: true,
      };
    })
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.offsetDays - b.s.offsetDays || a.i - b.i)
    .map(({ s }) => s);
}

export function isChangeConfirmed(change: ChangeAlert, state: ClientState): boolean {
  return change.confirmed || state.confirmedChangeIds.includes(change.id);
}

/** 이 행사에 걸린 변경 알림 중 아직 "확인함"을 누르지 않은 것 */
export function unconfirmedAlerts(
  event: EventCard,
  state: ClientState = EMPTY_CLIENT_STATE,
  changes: ChangeAlert[] = allChanges,
): ChangeAlert[] {
  // 기본 데이터는 validate 가 eventIds ↔ changeAlertIds 양방향을 맞춰 두므로 eventIds 만 보면 된다.
  // (담당자가 추가한 변경(addedChanges)은 행사의 changeAlertIds 에 없으므로 eventIds 로만 연결)
  return changes.filter((c) => c.eventIds.includes(event.id) && !isChangeConfirmed(c, state));
}

/**
 * 행사 하나의 단계별 마감일·상태를 계산한다.
 * 행사일(eventDate)을 바꾸면 모든 dueDate 가 따라 바뀐다.
 */
export function computeSchedule(
  event: EventCard,
  today: DateString,
  state: ClientState = EMPTY_CLIENT_STATE,
  template: Template = getTemplate(event.template),
  changes: ChangeAlert[] = allChanges,
): ScheduledStep[] {
  const eventDate = effectiveEventDate(event, state);
  const alerts = unconfirmedAlerts(event, state, changes);
  const allNotes = notesOf(event, state);
  // 템플릿 + 추가 단계(수정·숨김 반영), 마감 순
  return stepsOf(event, state, template).map((step) => {
    const dueDate = addDays(eventDate, step.offsetDays);
    const st = stepState(event, step.id, state);
    const daysLeft = diffDays(today, dueDate);
    return {
      id: step.id,
      label: step.label,
      offsetDays: step.offsetDays,
      ...(step.isCustom ? { isCustom: true, author: step.author, memo: step.memo } : {}),
      ...(step.edited ? { edited: true } : {}),
      dueDate,
      state: st,
      daysLeft,
      overdue: st === "todo" && daysLeft < 0,
      // 행사 전체에 걸린 알림(stepId=null)은 단계에 붙이지 않고 카드 단위로 표시
      alertIds: alerts.filter((a) => a.stepId === step.id).map((a) => a.id),
      // 작년 기록은 템플릿 단계에만 있다 (추가 단계는 memo 로 전달)
      lastYear: isCustomStepId(step.id) ? undefined : lastYearOfStep(event, step.id, step.offsetDays),
      notes: allNotes.filter((n) => n.stepId === step.id),
    };
  });
}

/** 데이터 메모 + 화면에서 추가한 메모 */
export function notesOf(event: EventCard, state: ClientState = EMPTY_CLIENT_STATE): HandoverNote[] {
  return [...event.handoverNotes, ...(state.extraNotes[event.id] ?? [])];
}

/** 특정 단계에 묶이지 않은 메모 (카드 전체 메모 영역에 표시) */
export function eventLevelNotes(event: EventCard, state: ClientState = EMPTY_CLIENT_STATE): HandoverNote[] {
  return notesOf(event, state).filter((n) => !n.stepId);
}

function lastYearOfStep(event: EventCard, stepId: StepId, recommendedOffset: number): ScheduledStep["lastYear"] {
  const ly = event.lastYear;
  const rec = ly?.steps[stepId];
  if (!ly || !rec) return undefined;
  const offset = rec.actualDate ? diffDays(ly.eventDate, rec.actualDate) : null;
  return {
    ...rec,
    offsetDays: offset,
    lateByDays: offset === null ? null : offset - recommendedOffset,
  };
}

/** 아직 안 끝난 첫 단계 (= "다음 단계") */
export function nextStep(schedule: ScheduledStep[]): ScheduledStep | null {
  return schedule.find((s) => s.state === "todo") ?? null;
}
