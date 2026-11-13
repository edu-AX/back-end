// 작업 지시서 3 — 체크리스트 직접 편집: 추가 단계·이름/마감 수정·숨김
import { describe, expect, it } from "vitest";
import { buildCalendar, buildDashboard } from "@/lib/dashboard";
import { changes, events, getEvent, guidelines, templates } from "@/lib/data";
import { handoverCoverage } from "@/lib/handover";
import { computeSchedule, stepsOf } from "@/lib/schedule";
import { EMPTY_CLIENT_STATE, type ClientState, type CustomStep, type EventCard } from "@/lib/types";
import { validateData } from "@/lib/validate";

const TODAY = "2027-03-11";
const trip = getEvent("E-07")!; // 2027-05-12
const insurance: CustomStep = { id: "custom-insurance", label: "수련원 보험증명서 계약 전 수령", offsetDays: -70, author: "나" };
const st = (p: Partial<ClientState>): ClientState => ({ ...EMPTY_CLIENT_STATE, ...p });

describe("computeSchedule — 추가 단계", () => {
  it("추가 단계가 마감일 순으로 끼어 들어간다", () => {
    const s = computeSchedule(trip, TODAY, st({ customSteps: { "E-07": [insurance] } }));
    expect(s.map((x) => x.id)).toEqual(["plan", "consent", "custom-insurance", "vendor", "safety_staff", "safety_edu", "execute", "report", "record"]);
    const c = s.find((x) => x.id === "custom-insurance")!;
    expect(c).toMatchObject({ isCustom: true, author: "나", dueDate: "2027-03-03", state: "todo", overdue: true });
    expect(c.lastYear).toBeUndefined();
  });

  it("카드에 들어 있는 추가 단계(업로드·전임자) + 내가 추가한 단계가 합쳐진다, 같은 id 는 한 번", () => {
    const card: EventCard = { ...trip, customSteps: [{ id: "custom-review", label: "학운위 심의", offsetDays: -100, author: "2026 담당 교사" }] };
    const s = computeSchedule(card, TODAY, st({ customSteps: { "E-07": [insurance, { ...insurance }] } }));
    expect(s.filter((x) => x.isCustom).map((x) => [x.id, x.author])).toEqual([
      ["custom-review", "2026 담당 교사"],
      ["custom-insurance", "나"],
    ]);
  });

  it("숨긴 단계가 빠진다", () => {
    const s = computeSchedule(trip, TODAY, st({ hiddenSteps: { "E-07": ["safety_edu"] } }));
    expect(s.map((x) => x.id)).not.toContain("safety_edu");
    expect(s).toHaveLength(7);
  });

  it("이름·마감 수정이 반영되고 순서도 다시 정렬된다", () => {
    const s = computeSchedule(trip, TODAY, st({ stepEdits: { "E-07": { vendor: { label: "업체 선정·사전답사(1회)", offsetDays: -95 } } } }));
    const v = s.find((x) => x.id === "vendor")!;
    expect(v).toMatchObject({ label: "업체 선정·사전답사(1회)", offsetDays: -95, dueDate: "2027-02-06", edited: true });
    expect(s.map((x) => x.id).slice(0, 3)).toEqual(["plan", "vendor", "consent"]);
    // 빈 이름은 무시
    const blank = computeSchedule(trip, TODAY, st({ stepEdits: { "E-07": { vendor: { label: "  " } } } }));
    expect(blank.find((x) => x.id === "vendor")!.label).toBe("업체 선정·계약, 사전답사");
  });

  it("추가 단계를 완료 체크하면 진행률 분모·분자가 바뀐다", () => {
    const base = buildDashboard(TODAY).progress.find((p) => p.eventId === "E-07")!;
    expect(base).toMatchObject({ done: 1, total: 8 });
    const added = st({ customSteps: { "E-07": [insurance] } });
    expect(buildDashboard(TODAY, added).progress.find((p) => p.eventId === "E-07")).toMatchObject({ done: 1, total: 9, percent: 11 });
    const doneIt = st({ customSteps: { "E-07": [insurance] }, stepStatus: { "E-07": { "custom-insurance": "done" } } });
    expect(buildDashboard(TODAY, doneIt).progress.find((p) => p.eventId === "E-07")).toMatchObject({ done: 2, total: 9, percent: 22 });
    const hidden = st({ hiddenSteps: { "E-07": ["safety_edu", "record"] } });
    expect(buildDashboard(TODAY, hidden).progress.find((p) => p.eventId === "E-07")!.total).toBe(6);
  });

  it("이번 주 마감·캘린더에 추가 단계가 나온다", () => {
    const thisWeek: CustomStep = { id: "custom-preregister", label: "단체 사전등록", offsetDays: -60 + 1, author: "나" }; // 3/14 (이번 주 일요일)
    const s = st({ customSteps: { "E-07": [thisWeek] } });
    expect(buildDashboard(TODAY, s).thisWeek.map((x) => x.id)).toContain("custom-preregister");
    const march = buildCalendar("2027-03", TODAY, s);
    expect(march.find((i) => i.stepId === "custom-preregister")).toMatchObject({ date: "2027-03-14", eventId: "E-07" });
  });

  it("넘기기 작성률: 추가 단계 포함, 숨긴 단계 제외", () => {
    const s = st({
      customSteps: { "E-07": [insurance] },
      hiddenSteps: { "E-07": ["record"] },
      extraNotes: { "E-07": [{ year: 2027, stepId: "custom-insurance", note: "3월 초에 받음" }] },
    });
    const c = handoverCoverage(2027, s).find((x) => x.eventId === "E-07")!;
    expect(c).toMatchObject({ recordedSteps: 1, totalSteps: 8 });
    expect(c.missingSteps.map((m) => m.stepId)).not.toContain("custom-insurance");
    expect(c.missingSteps.map((m) => m.stepId)).not.toContain("record");
  });

  it("stepsOf 는 마감 계산 없이 단계 정의만 준다", () => {
    expect(stepsOf(trip).map((x) => x.isCustom)).toEqual(Array(8).fill(false));
  });
});

describe("validate — 추가 단계", () => {
  const withCustom = (cs: CustomStep[], extra: Partial<EventCard> = {}) =>
    validateData({ events: events.map((e) => (e.id === "E-07" ? { ...e, customSteps: cs, ...extra } : e)), templates, guidelines, changes });

  it("정상: 추가 단계 id 로 stepStatus·메모를 걸 수 있다", () => {
    expect(
      withCustom([insurance], {
        stepStatus: { plan: "done", "custom-insurance": "done" },
        handoverNotes: [...trip.handoverNotes, { year: 2026, note: "보험 증명서", stepId: "custom-insurance" }],
      }),
    ).toEqual([]);
  });

  it("추가 단계 id 중복·템플릿 id 와 겹침·접두어 오류를 잡는다", () => {
    const errs = withCustom([insurance, { ...insurance }, { id: "plan" as never, label: "x", offsetDays: 0 }]);
    expect(errs.some((e) => e.includes("추가 단계 id 중복: custom-insurance"))).toBe(true);
    expect(errs.some((e) => e.includes('"custom-" 으로 시작'))).toBe(true);
    expect(errs.some((e) => e.includes("추가 단계 id 중복: plan"))).toBe(true);
  });
});
