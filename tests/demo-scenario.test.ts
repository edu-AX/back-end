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
