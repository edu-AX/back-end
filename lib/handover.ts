// 인수인계 중심 기능: "인수인계 받기" 요약, "작년 이맘때", "넘기기" 작성률.
// 모두 순수 함수라 브라우저 컴포넌트에서 바로 쓸 수 있다.
import { changes as allChanges, events as allEvents, getTemplate } from "./data";
import { addYears, diffDays } from "./dates";
import { effectiveEventDate, isChangeConfirmed, notesOf, stepsOf } from "./schedule";
import type {
  ChangeAlert,
  ClientState,
  DateString,
  EventCard,
  HandoverBrief,
  HandoverCoverage,
  HandoverNote,
  HandoverPoint,
  LastYearThisTime,
} from "./types";
import { EMPTY_CLIENT_STATE } from "./types";

/** 메모를 구분하는 고정 키. "확인함" 저장에 쓴다 */
export function noteKey(eventId: string, note: HandoverNote): string {
  return note.id ?? `${eventId}|${note.year}|${note.stepId ?? "-"}|${note.note}`;
}

function stepLabel(event: EventCard, stepId?: string, state: ClientState = EMPTY_CLIENT_STATE): string | undefined {
  if (!stepId) return undefined;
  // 추가 단계·이름 수정까지 반영된 단계 목록에서 찾는다
  return stepsOf(event, state).find((s) => s.id === stepId)?.label ?? getTemplate(event.template).steps.find((s) => s.id === stepId)?.label;
}

/**
 * "인수인계 받기" 화면용 요약.
 * 올해 담당자가 처음 들어왔을 때: 전임자 핵심 주의점 → 달라진 기준 → 행사별 작년/올해 한 줄.
 */
export function buildHandoverBrief(
  today: DateString,
  state: ClientState = EMPTY_CLIENT_STATE,
  events: EventCard[] = allEvents,
  changes: ChangeAlert[] = allChanges,
): HandoverBrief {
  const acked = new Set(state.acknowledgedNoteKeys ?? []);
  const sorted = [...events].sort((a, b) =>
    effectiveEventDate(a, state).localeCompare(effectiveEventDate(b, state)),
  );

  const toPoint = (ev: EventCard, n: HandoverNote): HandoverPoint => {
    const key = noteKey(ev.id, n);
    return {
      key,
      eventId: ev.id,
      eventTitle: ev.title,
      stepId: n.stepId,
      stepLabel: stepLabel(ev, n.stepId, state),
      note: n.note,
      year: n.year,
      author: n.author,
      acknowledged: acked.has(key),
    };
  };

  // 받는 메모 = 데이터에 있는 전임자 메모 (화면에서 올해 담당자가 쓴 메모는 제외)
  const received = sorted.flatMap((ev) => ev.handoverNotes.map((n) => toPoint(ev, n)));
  const keyPoints = sorted.flatMap((ev) => ev.handoverNotes.filter((n) => n.important).map((n) => toPoint(ev, n)));

  const owners = [...new Set(sorted.map((e) => e.lastYear?.owner).filter((o): o is string => !!o))];
  const years = sorted.map((e) => e.lastYear?.year).filter((y): y is number => typeof y === "number");

  const relevantChanges = changes
    .filter((c) => c.eventIds.some((id) => events.some((e) => e.id === id)))
    .map((c) => ({
      id: c.id,
      title: c.title,
      before: c.before,
      after: c.after,
      status: c.status,
      eventIds: c.eventIds,
      confirmed: isChangeConfirmed(c, state),
    }))
    .sort((a, b) => Number(a.confirmed) - Number(b.confirmed));

  return {
    from: owners,
    fromYear: years.length ? Math.max(...years) : null,
    accepted: Boolean(state.handoverAcceptedAt),
    acceptedAt: state.handoverAcceptedAt,
    keyPoints,
    changes: relevantChanges,
    events: sorted.map((ev) => {
      const date = effectiveEventDate(ev, state);
      const ly = ev.lastYear;
      return {
        eventId: ev.id,
        title: ev.title,
        scope: ev.scope,
        eventDate: date,
        dDay: diffDays(today, date),
        lastYearDate: ly?.eventDate ?? null,
        lastYearSummary: ly?.summary ?? null,
        noteCount: ev.handoverNotes.length,
        issueCount: ly ? Object.values(ly.steps).filter((s) => s?.hadIssue).length : 0,
      };
    }),
    progress: { acknowledged: received.filter((p) => p.acknowledged).length, total: received.length },
  };
}

/**
 * "작년 이맘때": 작년 실제 기록을 1년 뒤로 옮겼을 때 오늘 앞뒤에 걸리는 단계.
 * 기본: 7일 전 ~ 21일 후. 가까운 순.
 */
export function lastYearThisTime(
  today: DateString,
  events: EventCard[] = allEvents,
  window: { before: number; after: number } = { before: 7, after: 21 },
): LastYearThisTime[] {
  const out: LastYearThisTime[] = [];
  for (const ev of events) {
    const ly = ev.lastYear;
    if (!ly) continue;
    const shift = Number(today.slice(0, 4)) - ly.year;
    const tpl = getTemplate(ev.template);
    for (const step of tpl.steps) {
      const rec = ly.steps[step.id];
      if (!rec?.actualDate) continue;
      const d = diffDays(today, addYears(rec.actualDate, shift));
      if (d < -window.before || d > window.after) continue;
      out.push({
        eventId: ev.id,
        eventTitle: ev.title,
        stepId: step.id,
        stepLabel: step.label,
        lastYearDate: rec.actualDate,
        daysFromToday: d,
        memo: rec.memo,
        hadIssue: rec.hadIssue,
      });
    }
  }
  return out.sort((a, b) => Math.abs(a.daysFromToday) - Math.abs(b.daysFromToday) || a.daysFromToday - b.daysFromToday);
}

/**
 * "넘기기" 모드: 올해 담당자가 다음 담당자에게 남긴 기록이 얼마나 되는지.
 * 단계별로 올해(year) 메모가 하나라도 있으면 기록된 단계로 센다.
 */
export function handoverCoverage(
  year: number,
  state: ClientState = EMPTY_CLIENT_STATE,
  events: EventCard[] = allEvents,
): HandoverCoverage[] {
  return events.map((ev) => {
    const mine = notesOf(ev, state).filter((n) => n.year === year);
    // 추가한 단계도 기록할 단계에 포함, 숨긴 단계는 제외
    const steps = stepsOf(ev, state);
    const recorded = new Set(mine.map((n) => n.stepId).filter(Boolean));
    const missing = steps.filter((s) => !recorded.has(s.id)).map((s) => ({ stepId: s.id, label: s.label }));
    const recordedSteps = steps.length - missing.length;
    return {
      eventId: ev.id,
      title: ev.title,
      recordedSteps,
      totalSteps: steps.length,
      noteCount: mine.length,
      percent: steps.length ? Math.round((recordedSteps / steps.length) * 100) : 0,
      missingSteps: missing,
    };
  });
}

// ---------- 상태 변경 도우미 (불변 업데이트) ----------

export function acknowledgeNote(state: ClientState, key: string, on = true): ClientState {
  const cur = new Set(state.acknowledgedNoteKeys ?? []);
  if (on) cur.add(key);
  else cur.delete(key);
  return { ...state, acknowledgedNoteKeys: [...cur] };
}

export function acceptHandover(state: ClientState, today: DateString): ClientState {
  return { ...state, handoverAcceptedAt: today };
}
