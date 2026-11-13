// 5분 시연용 질문이 DEMO_MODE 에서 고정 답 + 출처 칩으로 나오는지 (작업 지시서 작업 4-2)
import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/chat/answer";

const demo = { demoMode: true, today: "2027-03-11", callLlm: null };

describe("시연 질문 — DEMO_MODE 고정 답", () => {
  it.each([
    ["작년 수학여행 때 뭐 주의해야 했어?", "비상구", "E-07"],
    ["동의율 몇 % 넘어야 해?", "80%", "G-INC-01"],
    ["안전요원 몇 명 필요해?", "50명당", "G-INC-01"],
  ])("%s", async (question, mustContain, chipId) => {
    const r = await answerQuestion({ question, focusEventId: "E-07" }, demo);
    expect(r.mode).toBe("demo");
    expect(r.notFound).toBe(false);
    expect(r.answer).toContain(mustContain);
    const chip = r.sources.find((s) => s.id === chipId);
    expect(chip).toBeDefined();
    expect(chip!.openEventId).toBe("E-07"); // 칩 클릭 → 수학여행 카드
  });
});

// 작업 지시서 2 — 작업 A: 데모 모드도 질문 속 행사를 인식한다
import { DEMO_ANSWERS } from "@/lib/chat/demo";
import { detectEvent } from "@/lib/chat/detect";
import { events } from "@/lib/data";

const TRIP_LAST_YEAR = DEMO_ANSWERS.find((d) => d.key === "lastYear")!.answer;
const TRIP_CONSENT = DEMO_ANSWERS.find((d) => d.key === "consent")!.answer;
const LIABILITY = DEMO_ANSWERS.find((d) => d.key === "liability")!.answer;
const ask = (question: string, focusEventId?: string) => answerQuestion({ question, focusEventId }, demo);
const ids = (r: Awaited<ReturnType<typeof ask>>) => r.sources.map((s) => s.id);

describe("데모 모드 — 행사별 답 (작업 A 표)", () => {
  it("작년 수학여행 때 뭐 주의해야 했어? → E-07, 비상구", async () => {
    const r = await ask("작년 수학여행 때 뭐 주의해야 했어?");
    expect(ids(r)).toContain("E-07");
    expect(r.answer).toContain("비상구");
    expect(r.answer).toBe(TRIP_LAST_YEAR); // 기존 시연 답 그대로
  });

  it("체육대회 작년에 문제 있었어? → E-03, 수학여행 얘기 없음", async () => {
    const r = await ask("체육대회 작년에 문제 있었어?");
    expect(ids(r)).toEqual(["E-03"]);
    expect(r.notFound).toBe(false);
    expect(r.answer).not.toContain("수학여행");
    expect(r.answer).not.toContain("비상구");
    expect(r.answer).toContain("체육대회");
    expect(r.answer).toContain("강당"); // 작년 총평·important 메모
  });

  it("작년엔 어떻게 했어? (열린 카드 E-05) → E-05", async () => {
    const r = await ask("작년엔 어떻게 했어?", "E-05");
    expect(ids(r)).toEqual(["E-05"]);
    expect(r.answer).toContain("수련활동");
  });

  it("수련활동 동의율 몇 %야? → E-05, 80%", async () => {
    const r = await ask("수련활동 동의율 몇 %야?");
    expect(ids(r)).toContain("E-05");
    expect(r.answer).toContain("80%");
    expect(r.answer).toContain("1학년 수련활동은 학년 전체 학부모 80% 이상의 동의가 있어야");
  });

  it("1일형 현장체험학습 안전요원 → 인원으로 필요 수 계산 (받침 없는 말엔 '는')", async () => {
    const r = await ask("1일형 현장체험학습 안전요원 몇 명?");
    expect(ids(r)).toContain("E-02");
    expect(r.answer).toContain("1학년 1일형 현장체험학습은 186명이 참가하니 최소 4명이 필요해요");
  });

  it("체육대회 안전요원 몇 명? → 교육청 기준 없음(notFound)", async () => {
    const r = await ask("체육대회 안전요원 몇 명?");
    expect(r.notFound).toBe(true);
    expect(r.answer).toContain("등록된 교육청 기준이 없어요");
  });

  it("동의율 몇 % 넘어야 해? (행사 없음) → 기존 수학여행 답 (회귀 방지)", async () => {
    const r = await ask("동의율 몇 % 넘어야 해?");
    expect(r.answer).toBe(TRIP_CONSENT);
    expect(ids(r)).toEqual(["G-INC-01", "E-07"]);
  });

  it("면책 기준 바뀌었어? (열린 카드 E-03) → 기존 면책 답 (행사와 무관)", async () => {
    const r = await ask("면책 기준 바뀌었어?", "E-03");
    expect(r.answer).toBe(LIABILITY);
  });

  it("작년 기록이 없는 행사 → 첫 해 안내", async () => {
    const fresh = { ...events[2], id: "X-9", title: "과학 탐구 캠프", lastYear: undefined };
    const { buildDemoAnswer } = await import("@/lib/chat/demo");
    const r = buildDemoAnswer("과학 탐구 캠프 작년에 뭐 했어?", { today: "2027-03-11", events: [...events, fresh] });
    expect(r).toMatchObject({ key: "lastYear", answer: "이 행사는 작년 기록이 없어요. 올해가 첫 해예요.", sourceIds: ["X-9"] });
  });

  it("어떤 규칙에도 안 맞으면 NOT_FOUND", async () => {
    const r = await ask("급식 메뉴 뭐야?", "E-03");
    expect(r.notFound).toBe(true);
  });
});

describe("detectEvent", () => {
  it.each([
    ["수학여행 사전답사", "E-07"],
    ["수련회 동의서", "E-05"],
    ["체육대회 우천", "E-03"],
    ["발대식 준비", "E-01"],
    ["현장체험학습 버스", "E-02"],
    ["숙박형 현장체험학습 동의율", null], // 1일형 아님
    ["축제 음향", "E-06"],
    ["진로체험 강사", "E-04"],
    ["동의율 몇 %?", null],
  ])("%s → %s", (q, id) => {
    expect(detectEvent(q, events)?.id ?? null).toBe(id);
  });

  it("질문에 행사가 없으면 열린 카드", () => {
    expect(detectEvent("작년엔 어떻게 했어?", events, "E-04")?.id).toBe("E-04");
  });
});
