import { describe, expect, it } from "vitest";
import { buildCalendar, buildDashboard } from "@/lib/dashboard";
import { getEvent } from "@/lib/data";
import { addDays, diffDays, formatDDay, startOfWeek } from "@/lib/dates";
import { computeSchedule, nextStep } from "@/lib/schedule";
import { EMPTY_CLIENT_STATE, type ClientState } from "@/lib/types";

const TODAY = "2027-03-11"; // 데모 기준일 (목요일)
const trip = getEvent("E-07")!; // 2학년 수학여행 2027-05-12

describe("날짜 계산", () => {
  it("addDays / diffDays 가 월·연 경계를 넘는다", () => {
    expect(addDays("2027-05-12", -120)).toBe("2027-01-12");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(diffDays("2027-03-11", "2027-05-12")).toBe(62);
    expect(diffDays("2027-05-12", "2027-03-11")).toBe(-62);
  });
  it("formatDDay", () => {
    expect(formatDDay(62)).toBe("D-62");
    expect(formatDDay(0)).toBe("D-day");
    expect(formatDDay(-3)).toBe("D+3");
  });
  it("startOfWeek 은 월요일", () => {
    expect(startOfWeek("2027-03-11")).toBe("2027-03-08");
    expect(startOfWeek("2027-03-14")).toBe("2027-03-08"); // 일요일
  });
});

describe("D-day 역산 체크리스트", () => {
  it("수학여행 단계별 마감일", () => {
    const s = computeSchedule(trip, TODAY);
    expect(s.map((x) => [x.id, x.dueDate])).toEqual([
      ["plan", "2027-01-12"],
      ["consent", "2027-02-11"],
      ["vendor", "2027-03-13"],
      ["safety_staff", "2027-04-12"],
      ["safety_edu", "2027-05-05"],
      ["execute", "2027-05-12"],
      ["report", "2027-05-26"],
      ["record", "2027-06-02"],
    ]);
  });

  it("행사일을 바꾸면 단계별 마감일이 따라 바뀐다 (완성 체크리스트)", () => {
    const state: ClientState = { ...EMPTY_CLIENT_STATE, eventDateOverrides: { "E-07": "2027-05-19" } };
    const before = computeSchedule(trip, TODAY);
    const after = computeSchedule(trip, TODAY, state);
    after.forEach((step, i) => expect(diffDays(before[i].dueDate, step.dueDate)).toBe(7));
  });

  it("다음 단계 = 동의서, 마감 지나서 overdue", () => {
    const s = computeSchedule(trip, TODAY);
    const next = nextStep(s)!;
    expect(next.id).toBe("consent");
    expect(next.overdue).toBe(true);
  });

  it("localStorage 완료 표시가 json 기본값보다 우선", () => {
    const state: ClientState = { ...EMPTY_CLIENT_STATE, stepStatus: { "E-07": { consent: "done", plan: "todo" } } };
    const s = computeSchedule(trip, TODAY, state);
    expect(s.find((x) => x.id === "consent")!.state).toBe("done");
    expect(s.find((x) => x.id === "plan")!.state).toBe("todo");
  });

  it("단계에 걸린 변경 알림은 확인하면 사라진다", () => {
    const sports = getEvent("E-03")!;
    const record = () => computeSchedule(sports, TODAY, state).find((x) => x.id === "record")!;
    let state = EMPTY_CLIENT_STATE;
    expect(record().alertIds).toEqual(["C-01"]);
    state = { ...EMPTY_CLIENT_STATE, confirmedChangeIds: ["C-01"] };
    expect(record().alertIds).toEqual([]);
  });
});

describe("대시보드", () => {
  const d = buildDashboard(TODAY);

  it("수학여행 D-62, 다음 단계 동의서 (시나리오 A)", () => {
    const t = d.upcoming.find((u) => u.eventId === "E-07")!;
    expect(t.dDay).toBe(62);
    expect(t.nextStep?.id).toBe("consent");
  });

  it("다가오는 행사는 가까운 순", () => {
    expect(d.upcoming[0].eventId).toBe("E-01");
    const days = d.upcoming.map((u) => u.dDay);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("이번 주 마감 단계", () => {
    expect(d.thisWeek.map((s) => [s.eventId, s.id, s.dueDate])).toEqual([
      ["E-02", "consent", "2027-03-09"],
      ["E-07", "vendor", "2027-03-13"],
    ]);
  });

  it("마감 지난 단계", () => {
    expect(d.overdue.map((s) => [s.eventId, s.id])).toEqual([
      ["E-07", "consent"],
      ["E-01", "safety_staff"],
      ["E-02", "consent"],
    ]);
  });

  it("진행률과 변경 알림 건수", () => {
    expect(d.progress.find((p) => p.eventId === "E-07")).toMatchObject({ done: 1, total: 8, percent: 13 });
    expect(d.unconfirmedAlertCount).toBe(2);
    const confirmed = buildDashboard(TODAY, { ...EMPTY_CLIENT_STATE, confirmedChangeIds: ["C-01", "C-02"] });
    expect(confirmed.unconfirmedAlertCount).toBe(0);
  });
});

describe("캘린더", () => {
  it("5월: 교내 초록·교외 파랑, 변경 알림 표시", () => {
    const may = buildCalendar("2027-05", TODAY);
    const tripDay = may.find((i) => i.eventId === "E-07" && i.kind === "event")!;
    expect(tripDay).toMatchObject({ date: "2027-05-12", color: "blue", hasAlert: true });
    const sportsDay = may.find((i) => i.eventId === "E-03" && i.kind === "event")!;
    expect(sportsDay).toMatchObject({ date: "2027-05-20", color: "green" });
    expect(may.every((i) => i.date.startsWith("2027-05-"))).toBe(true);
  });
});
