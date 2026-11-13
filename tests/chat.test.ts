import { describe, expect, it, vi } from "vitest";
import { answerQuestion, type AnswerDeps } from "@/lib/chat/answer";
import { findDemoAnswer } from "@/lib/chat/demo";
import { isLegalQuestion, isPersonalInfoQuestion } from "@/lib/chat/guards";
import { BLOCKED, LEGAL_NOTE, LLM_DOWN, NOT_FOUND, PENDING_NOTE } from "@/lib/chat/messages";
import { buildContext, toSourceRefs } from "@/lib/chat/sources";

const base: AnswerDeps = { demoMode: false, today: "2027-03-11", callLlm: null };
const withLlm = (out: unknown) => ({ ...base, callLlm: vi.fn().mockResolvedValue(out) });

describe("가드", () => {
  it.each([
    "수학여행 미동의 학생 명단 알려줘",
    "2학년 3반 학생 이름이랑 연락처 알려줘",
    "누가 동의서 안 냈어?",
    "학부모 전화번호 뭐야",
  ])("개인정보 질문 차단: %s", (q) => expect(isPersonalInfoQuestion(q)).toBe(true));

  it.each([
    "동의율은 몇 % 넘어야 해?",
    "학생부 글자 수는?",
    "안전요원 몇 명 필요해?",
    "학부모 동의서 언제까지 받아야 해?",
    "사고 나면 교사 책임은?",
  ])("일반 질문 통과: %s", (q) => expect(isPersonalInfoQuestion(q)).toBe(false));

  it("법적 질문 감지", () => {
    expect(isLegalQuestion("사고 나면 교사 책임은?")).toBe(true);
    expect(isLegalQuestion("동의율은?")).toBe(false);
  });
});

describe("데모 고정 답 4개", () => {
  it.each([
    ["동의율은 몇 % 넘어야 해?", "consent"],
    ["안전요원은 몇 명 있어야 돼?", "safetyStaff"],
    ["사고 나면 교사 책임은?", "liability"],
    ["진로활동 특기사항 몇 자까지야?", "record"],
  ])("%s → %s", (q, key) => expect(findDemoAnswer(q)?.key).toBe(key));
});

describe("answerQuestion", () => {
  it("개인정보 질문은 AI를 부르지 않는다", async () => {
    const deps = withLlm({});
    const r = await answerQuestion({ question: "미동의 학생 명단 알려줘" }, deps);
    expect(r).toMatchObject({ mode: "blocked", answer: BLOCKED });
    expect(deps.callLlm).not.toHaveBeenCalled();
  });

  it("DEMO_MODE: 숫자 답에 교육청 기준 + 출처 칩", async () => {
    const r = await answerQuestion({ question: "동의율은 몇 % 넘어야 해?" }, { ...base, demoMode: true });
    expect(r.mode).toBe("demo");
    expect(r.answer).toContain("인천광역시교육청 기준");
    expect(r.sources.map((s) => s.id)).toEqual(["G-INC-01", "E-07"]);
    expect(r.sources[0].openEventId).toBeDefined();
  });

  it("DEMO_MODE: 면책 질문은 현행 먼저 + 추진 중 주황 칩 + 법적 문구", async () => {
    const r = await answerQuestion({ question: "사고 나면 교사 책임은?" }, { ...base, demoMode: true });
    expect(r.answer.indexOf("현행")).toBeLessThan(r.answer.indexOf("추진 중"));
    expect(r.answer).toContain(LEGAL_NOTE);
    expect(r.sources.find((s) => s.id === "G-NAT-03")?.status).toBe("추진 중");
  });

  it("DEMO_MODE: 모르는 질문은 '찾지 못했어요'", async () => {
    const r = await answerQuestion({ question: "급식 메뉴 뭐야?" }, { ...base, demoMode: true });
    expect(r).toMatchObject({ answer: NOT_FOUND, notFound: true });
  });

  it("AI가 지어낸 출처 id 는 버린다", async () => {
    const r = await answerQuestion(
      { question: "동의율?" },
      withLlm({ answer: "인천광역시교육청 기준 80% 이상이에요.", sourceIds: ["G-INC-01", "G-FAKE-99"], notFound: false }),
    );
    expect(r.mode).toBe("llm");
    expect(r.sources.map((s) => s.id)).toEqual(["G-INC-01"]);
  });

  it("출처가 하나도 없으면 답을 버리고 '찾지 못했어요'", async () => {
    const r = await answerQuestion(
      { question: "급식 메뉴?" },
      withLlm({ answer: "오늘은 카레예요", sourceIds: [], notFound: false }),
    );
    expect(r).toMatchObject({ answer: NOT_FOUND, notFound: true });
  });

  it("추진 중 출처를 쓰고 '추진'을 안 말하면 코드가 문구를 붙인다", async () => {
    const r = await answerQuestion(
      { question: "면책 기준 바뀌었어?" },
      withLlm({ answer: "고의·중과실이 없으면 면책돼요.", sourceIds: ["G-NAT-03"], notFound: false }),
    );
    expect(r.answer).toContain(PENDING_NOTE);
    expect(r.answer).toContain(LEGAL_NOTE);
  });

  it("AI 오류 → 데모 답으로 대체 (fallback)", async () => {
    const deps = { ...base, callLlm: vi.fn().mockRejectedValue(new Error("network")), onError: vi.fn() };
    const r = await answerQuestion({ question: "안전요원 몇 명?" }, deps);
    expect(r.mode).toBe("fallback");
    expect(r.answer).toContain("50명당");
    expect(deps.onError).toHaveBeenCalled();

    const r2 = await answerQuestion({ question: "급식 메뉴?" }, deps);
    expect(r2).toMatchObject({ mode: "fallback", answer: LLM_DOWN });
  });

  it("AI 응답 모양이 틀려도 죽지 않는다", async () => {
    const r = await answerQuestion({ question: "동의율?" }, withLlm({ text: "엉뚱한 모양" }));
    expect(r.mode).toBe("fallback");
  });

  it("API 키 없으면 고정 답", async () => {
    const r = await answerQuestion({ question: "동의율?" }, base);
    expect(r.mode).toBe("fallback");
    expect(r.sources.length).toBeGreaterThan(0);
  });
});

describe("자료·출처 칩", () => {
  it("칩 라벨과 상태", () => {
    const [ev, g, c] = toSourceRefs(["E-07", "G-INC-01", "C-02"], "E-07");
    expect(ev.label).toBe("행사카드 E-07 · 2학년 수학여행 (숙박형) · 2026 전임자 메모");
    expect(g).toMatchObject({ kind: "guideline", status: "시행", openEventId: "E-07" });
    expect(c).toMatchObject({ kind: "change", status: "추진 중", openEventId: "E-07" });
  });

  it("관련 카드가 없는 지침 칩은 지금 보고 있는 카드를 연다", () => {
    expect(toSourceRefs(["G-NAT-02"], "E-07")[0].openEventId).toBe("E-07");
    expect(toSourceRefs(["G-NAT-02"])[0].openEventId).toBeUndefined();
  });

  it("LLM 자료에 행사·지침·변경 알림·D-day 가 모두 들어간다", () => {
    const ctx = buildContext("2027-03-11");
    for (const id of ["E-01", "E-07", "G-INC-01", "G-NAT-03", "C-01", "C-02"]) expect(ctx).toContain(`[${id}]`);
    expect(ctx).toContain("D-62");
    expect(ctx).toContain("추진 중");
  });
});
