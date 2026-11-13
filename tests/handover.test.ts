import { describe, expect, it } from "vitest";
import { findDemoAnswer } from "@/lib/chat/demo";
import { buildContext } from "@/lib/chat/sources";
import { getEvent } from "@/lib/data";
import { addYears } from "@/lib/dates";
import {
  acceptHandover,
  acknowledgeNote,
  buildHandoverBrief,
  handoverCoverage,
  lastYearThisTime,
  noteKey,
} from "@/lib/handover";
import { computeSchedule, eventLevelNotes } from "@/lib/schedule";
import { EMPTY_CLIENT_STATE, type ClientState } from "@/lib/types";
import { DEMO_DRAFT, draftToEventCard } from "@/lib/upload/draft";

const TODAY = "2027-03-11";
const trip = getEvent("E-07")!;

describe("체크리스트 단계마다 작년 기록·전임자 메모", () => {
  const s = computeSchedule(trip, TODAY);
  const step = (id: string) => s.find((x) => x.id === id)!;

  it("사전답사 단계: 작년 실제 날짜 + 문제 표시 + 전임자 메모", () => {
    const v = step("vendor");
    expect(v.lastYear).toMatchObject({ actualDate: "2026-03-14", hadIssue: true, offsetDays: -60, lateByDays: 0 });
    expect(v.notes.map((n) => n.id)).toEqual(["N-07-1"]);
  });

  it("작년에 권장보다 늦게 한 단계는 lateByDays 가 양수", () => {
    // 정산: 작년 행사 3주 뒤(D+21)에 함, 권장은 D+14 → 7일 늦음
    expect(step("report").lastYear).toMatchObject({ offsetDays: 21, lateByDays: 7, hadIssue: true });
  });

  it("동의서 단계에 설명회 메모가 붙는다", () => {
    expect(step("consent").notes.map((n) => n.id)).toEqual(["N-07-2"]);
  });

  it("작년 기록이 없는 행사는 lastYear 가 비고 notes 는 빈 배열", () => {
    const fresh = { ...trip, id: "X-1", lastYear: undefined, handoverNotes: [] };
    const r = computeSchedule(fresh, TODAY);
    expect(r.every((x) => x.lastYear === undefined && x.notes.length === 0)).toBe(true);
  });

  it("화면에서 단계에 붙여 쓴 메모도 그 단계에 나온다", () => {
    const state: ClientState = {
      ...EMPTY_CLIENT_STATE,
      extraNotes: { "E-07": [{ year: 2027, stepId: "vendor", note: "올해는 3/12 답사" }, { year: 2027, note: "전체 메모" }] },
    };
    const v = computeSchedule(trip, TODAY, state).find((x) => x.id === "vendor")!;
    expect(v.notes.map((n) => n.note)).toEqual([expect.stringContaining("비상구"), "올해는 3/12 답사"]);
    expect(eventLevelNotes(trip, state).map((n) => n.note)).toEqual(["전체 메모"]);
  });
});

describe("인수인계 받기 요약", () => {
  const b = buildHandoverBrief(TODAY);

  it("누구에게서 받는지", () => {
    expect(b).toMatchObject({ from: ["2026 담당 교사"], fromYear: 2026, accepted: false });
  });

  it("핵심 주의점 = important 메모, 행사일 순", () => {
    expect(b.keyPoints.map((p) => p.key)).toEqual([
      "N-01-1", "N-02-1", "N-07-1", "N-07-2", "N-03-1", "N-04-1", "N-05-1", "N-06-1",
    ]);
    expect(b.keyPoints[2]).toMatchObject({ eventTitle: "2학년 수학여행 (숙박형)", stepLabel: "업체 선정·계약, 사전답사" });
  });

  it("달라진 기준 2건, 행사별 작년/올해 한 줄", () => {
    expect(b.changes.map((c) => c.id).sort()).toEqual(["C-01", "C-02"]);
    const t = b.events.find((e) => e.eventId === "E-07")!;
    expect(t).toMatchObject({ dDay: 62, lastYearDate: "2026-05-13", noteCount: 3, issueCount: 2 });
    expect(b.events[0].eventId).toBe("E-01");
  });

  it("메모 확인·인수 확인 상태가 반영된다", () => {
    let st = acknowledgeNote(EMPTY_CLIENT_STATE, "N-07-1");
    st = acknowledgeNote(st, "N-02-1");
    st = acceptHandover(st, TODAY);
    const b2 = buildHandoverBrief(TODAY, st);
    expect(b2.progress).toEqual({ acknowledged: 2, total: 11 });
    expect(b2.keyPoints.find((p) => p.key === "N-07-1")!.acknowledged).toBe(true);
    expect(b2).toMatchObject({ accepted: true, acceptedAt: TODAY });
    expect(buildHandoverBrief(TODAY, acknowledgeNote(st, "N-07-1", false)).progress.acknowledged).toBe(1);
  });

  it("id 없는 메모도 고정 키가 생긴다", () => {
    const n = { year: 2027, note: "a", stepId: "plan" as const };
    expect(noteKey("E-01", n)).toBe(noteKey("E-01", { ...n }));
  });
});

describe("작년 이맘때", () => {
  it("오늘 기준 7일 전 ~ 21일 후, 가까운 순", () => {
    const r = lastYearThisTime(TODAY);
    expect(r.map((x) => [x.eventId, x.stepId, x.daysFromToday])).toEqual([
      ["E-02", "consent", -1],
      ["E-07", "vendor", 3],
      ["E-01", "safety_staff", -5],
      ["E-01", "safety_edu", 6],
      ["E-01", "plan", -7],
      ["E-01", "execute", 9],
      ["E-02", "vendor", 14],
      ["E-01", "report", 19],
    ]);
    expect(r[1]).toMatchObject({ lastYearDate: "2026-03-14", hadIssue: true });
  });

  it("addYears 는 윤일을 처리한다", () => {
    expect(addYears("2028-02-29", -1)).toBe("2027-02-28");
    expect(addYears("2026-03-14", 1)).toBe("2027-03-14");
  });
});

describe("넘기기 작성률", () => {
  it("올해 단계별 메모가 있는 단계만 센다", () => {
    const state: ClientState = {
      ...EMPTY_CLIENT_STATE,
      extraNotes: { "E-07": [{ year: 2027, stepId: "vendor", note: "답사 완료" }, { year: 2027, note: "전체 메모" }] },
    };
    const c = handoverCoverage(2027, state).find((x) => x.eventId === "E-07")!;
    expect(c).toMatchObject({ recordedSteps: 1, totalSteps: 8, noteCount: 2, percent: 13 });
    expect(c.missingSteps.map((m) => m.stepId)).not.toContain("vendor");
    // 작년(2026) 데이터 메모는 올해 작성률에 안 들어간다
    expect(handoverCoverage(2027).every((x) => x.recordedSteps === 0)).toBe(true);
  });
});

describe("결과보고서 → 내년 카드: 작년 기록으로 넘어간다", () => {
  const card = draftToEventCard(DEMO_DRAFT, { id: "U-1", nextEventDate: "2027-05-12", year: 2026, author: "2026 담당 교사" });

  it("단계별 실제 날짜·메모가 lastYear 로", () => {
    expect(card.lastYear).toMatchObject({ year: 2026, eventDate: "2026-05-13", owner: "2026 담당 교사" });
    expect(card.lastYear!.steps.vendor?.memo).toContain("비상구");
    const v = computeSchedule(card, TODAY).find((x) => x.id === "vendor")!;
    expect(v.lastYear?.offsetDays).toBe(-60);
  });

  it("주의점은 important 메모가 되어 인수인계 받기에 뜬다", () => {
    expect(card.handoverNotes.filter((n) => n.important)).toHaveLength(DEMO_DRAFT.cautions.length);
    const b = buildHandoverBrief(TODAY, EMPTY_CLIENT_STATE, [card]);
    expect(b.keyPoints).toHaveLength(DEMO_DRAFT.cautions.length);
  });
});

describe("챗봇 자료에 작년 기록 포함", () => {
  it("LLM 자료에 작년 실제 기록·단계 이름 붙은 메모가 들어간다", () => {
    const ctx = buildContext(TODAY);
    expect(ctx).toContain("작년(2026) 실제 기록: 행사일 2026-05-13");
    expect(ctx).toContain("업체 선정·계약, 사전답사: 2026-03-14 — 사전답사 실시, 숙소 비상구 확인을 놓쳐 4월에 재확인 (문제 있었음)");
    expect(ctx).toContain("2026 전임자 메모 [학생·학부모 의견 수렴 / 동의서]");
  });

  it("데모 모드: '작년엔 어떻게 했어?' 고정 답", () => {
    expect(findDemoAnswer("작년엔 수학여행 어떻게 했어?")?.key).toBe("lastYear");
    expect(findDemoAnswer("작년 담당자가 뭐 주의하라고 했어?")?.key).toBe("lastYear");
    // 기존 질문은 그대로
    expect(findDemoAnswer("진로활동 특기사항 몇 자까지야?")?.key).toBe("record");
    expect(findDemoAnswer("동의율은 몇 % 넘어야 해?")?.key).toBe("consent");
  });
});
