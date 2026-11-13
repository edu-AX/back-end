// 자료(행사 카드·지침·변경 알림)를 LLM용 텍스트와 출처 칩(SourceRef)으로 바꾼다.
import { changes, events, getChange, getEvent, getGuideline, guidelines } from "../data";
import { formatDDay } from "../dates";
import { computeSchedule } from "../schedule";
import type { ClientState, DateString, SourceRef } from "../types";
import { EMPTY_CLIENT_STATE } from "../types";

export function isKnownSourceId(id: string): boolean {
  return Boolean(getEvent(id) || getGuideline(id) || getChange(id));
}

/** 지침과 관련된 행사 id 목록 (칩을 눌렀을 때 열 카드 고르기용) */
function eventsForGuideline(guidelineId: string): string[] {
  const viaRules = events.filter((e) => e.officeRules?.sourceId === guidelineId).map((e) => e.id);
  const viaChanges = changes.filter((c) => c.guidelineId === guidelineId).flatMap((c) => c.eventIds);
  return [...new Set([...viaRules, ...viaChanges])];
}

/** 칩을 눌렀을 때 열 카드: 지금 보고 있는 카드가 관련 있으면 그것, 아니면 첫 관련 카드, 관련 카드가 없으면 지금 카드 */
function pickOpen(candidates: string[], focusEventId?: string): string | undefined {
  if (focusEventId && (candidates.includes(focusEventId) || candidates.length === 0)) return focusEventId;
  return candidates[0];
}

export function toSourceRef(id: string, focusEventId?: string): SourceRef | null {
  const ev = getEvent(id);
  if (ev) {
    const hasNotes = ev.handoverNotes.length > 0;
    const noteYear = hasNotes ? Math.max(...ev.handoverNotes.map((n) => n.year)) : undefined;
    return {
      id,
      kind: "event",
      label: `행사카드 ${id} · ${ev.title}${noteYear ? ` · ${noteYear} 전임자 메모` : ""}`,
      openEventId: id,
    };
  }
  const g = getGuideline(id);
  if (g) {
    return {
      id,
      kind: "guideline",
      label: `${g.sourceName} ${id} · ${g.year} 기준`,
      status: g.status,
      baseDate: g.baseDate,
      openEventId: pickOpen(eventsForGuideline(id), focusEventId),
    };
  }
  const c = getChange(id);
  if (c) {
    return {
      id,
      kind: "change",
      label: `변경 알림 ${id} · ${c.title}`,
      status: c.status,
      openEventId: pickOpen(c.eventIds, focusEventId),
    };
  }
  return null;
}

/** 존재하는 id 만 남기고, 중복 제거, 칩으로 변환 */
export function toSourceRefs(ids: string[], focusEventId?: string): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ref = toSourceRef(id, focusEventId);
    if (ref) out.push(ref);
  }
  return out;
}

/**
 * LLM에 넘길 자료 전체. 데이터가 작아서 검색 없이 전부 넣는다 (기획서 6장: "전체 주입으로 충분").
 * 행사가 수십 개 이상으로 늘면 여기서 키워드로 걸러 넣도록 바꾸면 된다.
 */
export function buildContext(today: DateString, state: ClientState = EMPTY_CLIENT_STATE): string {
  const parts: string[] = [];

  parts.push(`## 오늘 날짜: ${today}`);

  parts.push("## 행사 카드");
  for (const e of events) {
    const schedule = computeSchedule(e, today, state);
    const lines = [
      `[${e.id}] ${e.title} (${e.scope}) — 행사일 ${state.eventDateOverrides[e.id] ?? e.eventDate}` +
        (e.participants ? `, 참가 ${e.participants}명` : ""),
      ...schedule.map(
        (s) =>
          `  - ${s.label}: 마감 ${s.dueDate} (${formatDDay(s.daysLeft)}), ${s.state === "done" ? "완료" : "미완료"}`,
      ),
    ];
    if (e.officeRules) {
      const r = e.officeRules;
      lines.push(
        `  - 우리 교육청(${r.office}) 기준: ` +
          [r.consentRate && `동의율 ${r.consentRate}`, r.safetyStaff && `안전요원 ${r.safetyStaff}`]
            .filter(Boolean)
            .join(", ") +
          ` (출처 ${r.sourceId})`,
      );
    }
    const notes = [...e.handoverNotes, ...(state.extraNotes[e.id] ?? [])];
    for (const n of notes) lines.push(`  - ${n.year} 전임자 메모: ${n.note}`);
    if (e.changeAlertIds.length) lines.push(`  - 걸린 변경 알림: ${e.changeAlertIds.join(", ")}`);
    parts.push(lines.join("\n"));
  }

  parts.push("## 지침");
  for (const g of guidelines) {
    parts.push(
      [
        `[${g.id}] ${g.title} — 상태: ${g.status}, 적용 범위: ${g.scope}, 기준일: ${g.baseDate}, 출처: ${g.sourceName}`,
        ...g.sections.map((s) => `  - ${s.heading}: ${s.text}`),
      ].join("\n"),
    );
  }

  parts.push("## 변경 알림 (작년 → 올해)");
  for (const c of changes) {
    parts.push(
      `[${c.id}] ${c.title} — 상태: ${c.status}\n  - 이전: ${c.before}\n  - 이후: ${c.after}\n  - 관련 행사: ${c.eventIds.join(", ")}, 근거 지침: ${c.guidelineId}, 출처: ${c.source}`,
    );
  }

  return parts.join("\n\n");
}
