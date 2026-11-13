// JSON 데이터끼리 id 가 서로 맞는지 검사. 데이터를 고친 뒤 `npm test` 로 확인하세요.
import { isDateString } from "./dates";
import type { ChangeAlert, EventCard, Guideline, Template } from "./types";
import { STEP_IDS } from "./types";

export function validateData(d: {
  events: EventCard[];
  templates: Template[];
  guidelines: Guideline[];
  changes: ChangeAlert[];
}): string[] {
  const errors: string[] = [];
  const stepIds = new Set<string>(STEP_IDS);
  const templateIds = new Set(d.templates.map((t) => t.id));
  const guidelineIds = new Set(d.guidelines.map((g) => g.id));
  const changeIds = new Set(d.changes.map((c) => c.id));
  const eventIds = new Set(d.events.map((e) => e.id));

  const dup = (arr: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of arr) {
      if (seen.has(id)) errors.push(`${what} id 중복: ${id}`);
      seen.add(id);
    }
  };
  dup(d.events.map((e) => e.id), "행사");
  dup(d.guidelines.map((g) => g.id), "지침");
  dup(d.changes.map((c) => c.id), "변경 알림");

  for (const t of d.templates) {
    for (const s of t.steps) if (!stepIds.has(s.id)) errors.push(`템플릿 ${t.id}: 알 수 없는 단계 id ${s.id}`);
  }

  for (const e of d.events) {
    if (!isDateString(e.eventDate)) errors.push(`행사 ${e.id}: eventDate 형식 오류 ${e.eventDate}`);
    const tpl = d.templates.find((t) => t.id === e.template);
    if (!tpl) errors.push(`행사 ${e.id}: 템플릿 ${e.template} 없음`);
    else if (tpl.scope !== e.scope) errors.push(`행사 ${e.id}: scope(${e.scope})와 템플릿 scope(${tpl.scope})가 다름`);
    for (const k of Object.keys(e.stepStatus)) {
      if (!tpl?.steps.some((s) => s.id === k)) errors.push(`행사 ${e.id}: stepStatus 키 ${k} 가 템플릿에 없음`);
    }
    if (e.officeRules && !guidelineIds.has(e.officeRules.sourceId))
      errors.push(`행사 ${e.id}: officeRules.sourceId ${e.officeRules.sourceId} 지침 없음`);
    for (const c of e.changeAlertIds) if (!changeIds.has(c)) errors.push(`행사 ${e.id}: 변경 알림 ${c} 없음`);
  }

  for (const c of d.changes) {
    if (!guidelineIds.has(c.guidelineId)) errors.push(`변경 ${c.id}: 지침 ${c.guidelineId} 없음`);
    if (c.stepId && !stepIds.has(c.stepId)) errors.push(`변경 ${c.id}: 단계 ${c.stepId} 없음`);
    for (const eid of c.eventIds) {
      if (!eventIds.has(eid)) errors.push(`변경 ${c.id}: 행사 ${eid} 없음`);
      const ev = d.events.find((e) => e.id === eid);
      if (ev && !ev.changeAlertIds.includes(c.id)) errors.push(`변경 ${c.id}: 행사 ${eid} 의 changeAlertIds 에 빠짐`);
    }
  }

  for (const g of d.guidelines) {
    if (!isDateString(g.baseDate)) errors.push(`지침 ${g.id}: baseDate 형식 오류`);
    if (g.status !== "시행" && g.status !== "추진 중") errors.push(`지침 ${g.id}: status 는 "시행" 또는 "추진 중"`);
  }

  return errors;
}
