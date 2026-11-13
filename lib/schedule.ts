// D-day 역산: 행사일 + 템플릿 → 단계별 마감일
import { changes as allChanges, getTemplate } from "./data";
import { addDays, diffDays } from "./dates";
import type {
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
import { EMPTY_CLIENT_STATE } from "./types";

/** 화면에서 바꾼 행사일이 있으면 그걸 쓴다 */
export function effectiveEventDate(event: EventCard, state: ClientState = EMPTY_CLIENT_STATE): DateString {
  return state.eventDateOverrides[event.id] ?? event.eventDate;
}

/** 단계 상태: localStorage 값 > events.json 기본값 > "todo" */
export function stepState(event: EventCard, stepId: StepId, state: ClientState): StepState {
  return state.stepStatus[event.id]?.[stepId] ?? event.stepStatus[stepId] ?? "todo";
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
  return changes.filter(
    (c) => c.eventIds.includes(event.id) && event.changeAlertIds.includes(c.id) && !isChangeConfirmed(c, state),
  );
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
  return template.steps.map((step) => {
    const dueDate = addDays(eventDate, step.offsetDays);
    const st = stepState(event, step.id, state);
    const daysLeft = diffDays(today, dueDate);
    return {
      id: step.id,
      label: step.label,
      offsetDays: step.offsetDays,
      dueDate,
      state: st,
      daysLeft,
      overdue: st === "todo" && daysLeft < 0,
      // 행사 전체에 걸린 알림(stepId=null)은 단계에 붙이지 않고 카드 단위로 표시
      alertIds: alerts.filter((a) => a.stepId === step.id).map((a) => a.id),
      lastYear: lastYearOfStep(event, step.id, step.offsetDays),
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
