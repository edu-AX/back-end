// 대시보드 요약 위젯과 캘린더에 들어갈 값을 계산한다. 화면은 이 결과를 그리기만 하면 된다.
import { changes as allChanges, events as allEvents } from "./data";
import { addDays, diffDays, startOfWeek } from "./dates";
import { computeSchedule, effectiveEventDate, isChangeConfirmed, nextStep, unconfirmedAlerts } from "./schedule";
import type { CalendarItem, ChangeAlert, ClientState, DashboardSummary, DateString, EventCard } from "./types";
import { EMPTY_CLIENT_STATE } from "./types";

export function buildDashboard(
  today: DateString,
  state: ClientState = EMPTY_CLIENT_STATE,
  events: EventCard[] = allEvents,
  changes: ChangeAlert[] = allChanges,
): DashboardSummary {
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const rows = events.map((event) => {
    const schedule = computeSchedule(event, today, state, undefined, changes);
    return { event, schedule, eventDate: effectiveEventDate(event, state) };
  });

  const upcoming = rows
    .map(({ event, schedule, eventDate }) => ({
      eventId: event.id,
      title: event.title,
      scope: event.scope,
      eventDate,
      dDay: diffDays(today, eventDate),
      nextStep: nextStep(schedule),
    }))
    .filter((r) => r.dDay >= 0)
    .sort((a, b) => a.dDay - b.dDay);

  const progress = rows.map(({ event, schedule }) => {
    const done = schedule.filter((s) => s.state === "done").length;
    return {
      eventId: event.id,
      title: event.title,
      done,
      total: schedule.length,
      percent: schedule.length ? Math.round((done / schedule.length) * 100) : 0,
    };
  });

  const flat = rows.flatMap(({ event, schedule }) =>
    schedule.map((s) => ({ ...s, eventId: event.id, eventTitle: event.title })),
  );

  const thisWeek = flat
    .filter((s) => s.state === "todo" && s.dueDate >= weekStart && s.dueDate <= weekEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const overdue = flat.filter((s) => s.overdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const unconfirmedAlertCount = changes.filter((c) => !isChangeConfirmed(c, state)).length;

  return { today, upcoming, progress, thisWeek, overdue, unconfirmedAlertCount };
}

/** month: "2027-05" → 그 달에 표시할 행사일·단계 마감일 */
export function buildCalendar(
  month: string,
  today: DateString,
  state: ClientState = EMPTY_CLIENT_STATE,
  events: EventCard[] = allEvents,
  changes: ChangeAlert[] = allChanges,
): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const event of events) {
    const color = event.scope === "교내" ? "green" : "blue";
    const hasAlert = unconfirmedAlerts(event, state, changes).length > 0;
    const schedule = computeSchedule(event, today, state, undefined, changes);
    for (const step of schedule) {
      if (step.id === "execute") continue; // 실시일 = 행사일이므로 아래 event 항목으로 표시
      items.push({
        date: step.dueDate,
        eventId: event.id,
        kind: "deadline",
        label: `${event.title} · ${step.label}`,
        scope: event.scope,
        color,
        stepId: step.id,
        hasAlert: step.alertIds.length > 0,
        done: step.state === "done",
      });
    }
    items.push({
      date: effectiveEventDate(event, state),
      eventId: event.id,
      kind: "event",
      label: event.title,
      scope: event.scope,
      color,
      hasAlert,
    });
  }
  return items
    .filter((i) => i.date.startsWith(`${month}-`))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "event" ? -1 : 1));
}
