// JSON 데이터를 타입을 붙여 내보냅니다. 서버·브라우저 어디서나 import 가능.
import eventsJson from "@/data/events.json";
import templatesJson from "@/data/templates.json";
import guidelinesJson from "@/data/guidelines.json";
import changesJson from "@/data/changes.json";
import type { ChangeAlert, EventCard, Guideline, Template, TemplateId } from "./types";

export const events = eventsJson as EventCard[];
export const templates = templatesJson as Template[];
export const guidelines = guidelinesJson as Guideline[];
export const changes = changesJson as ChangeAlert[];

export function getTemplate(id: TemplateId): Template {
  const t = templates.find((x) => x.id === id);
  if (!t) throw new Error(`템플릿 ${id} 이(가) templates.json 에 없습니다`);
  return t;
}

/** 기본 행사 + 업로드로 추가한 행사. 대시보드·캘린더에 넘길 목록 */
export function eventsWithAdded(state: { addedEvents?: EventCard[] }): EventCard[] {
  return [...events, ...(state.addedEvents ?? [])];
}

/** 기본 변경 알림 + 담당자가 "기준 업데이트 확인"에서 추가한 변경. 대시보드·캘린더·카드·인수인계에 넘길 목록 */
export function changesWithAdded(state: { addedChanges?: ChangeAlert[] }): ChangeAlert[] {
  const added = (state.addedChanges ?? []).filter((c) => !changes.some((b) => b.id === c.id));
  return [...changes, ...added];
}

export const getEvent = (id: string) => events.find((e) => e.id === id);
export const getGuideline = (id: string) => guidelines.find((g) => g.id === id);
export const getChange = (id: string) => changes.find((c) => c.id === id);
