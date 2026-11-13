// 작업 지시서 3 — 업로드 초안 확장 (모든 탭 자동 작성)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRAFT_OUTPUT_SCHEMA } from "@/lib/chat/prompt";
import { events } from "@/lib/data";
import { maskPersonalInfo } from "@/lib/masking";
import { computeSchedule } from "@/lib/schedule";
import { DEMO_DRAFT, draftExtras, draftToEventCard, normalizeDraft } from "@/lib/upload/draft";

const core = {
  title: "체육대회",
  scope: "교내",
  template: "IN_SCHOOL",
  eventDate: "2026-05-21",
  steps: [{ stepId: "plan", actualDate: "2026-04-03", memo: "" }],
  cautions: ["우천 대비"],
  handoverNote: "강당 협의 먼저",
};

describe("normalizeDraft — 새 필드가 없거나 일부만 있어도 통과", () => {
  it("예전 모양(새 필드 없음) → 새 필드는 null·빈 배열", () => {
    const d = normalizeDraft(core);
    expect(d).toMatchObject({ title: "체육대회", budget: null, venues: [], candidates: [], skipped: [], customSteps: [], career: null, ownerNote: null });
  });

  it("일부만 있거나 형식이 틀린 항목은 버리고 나머지는 살린다", () => {
    const d = normalizeDraft({
      ...core,
      budget: { total: 3000000.4, perStudent: null, sources: [{ type: "학교회계", amount: "많음" }], items: "x", memo: "" },
      venues: [{ name: "(가상) 강당", type: "교내", memo: "", rating: 9 }, { foo: 1 }],
      candidates: [{ kind: "숙소", name: "A안", chosen: true, reason: "가까움" }, { name: "" }],
      skipped: ["리허설 2회 → 1회", 3],
      customSteps: [
        { label: "학운위 심의", actualDate: "2026-04-10", memo: "" },
        { label: "날짜 없는 단계", actualDate: "", memo: "" },
      ],
      career: { tracks: ["예체능", "우주"], subjects: [], creativeArea: "자율활동", target: "" },
      ownerNote: { good: "", problem: "", nextYear: "" },
    });
    expect(d.budget).toEqual({ total: 3000000, perStudent: null, sources: [{ type: "학교회계", amount: null }], items: [], memo: "" });
    expect(d.venues).toEqual([{ name: "(가상) 강당", type: "교내", memo: "", rating: null }]); // 평점 범위 밖 → null
    expect(d.candidates).toEqual([{ kind: "장소", name: "A안", chosen: true, reason: "가까움" }]); // 모르는 kind → 장소
    expect(d.skipped).toEqual(["리허설 2회 → 1회"]);
    // 날짜로 행사일 대비 offset 계산, 날짜 없으면 넣지 않음(추측 금지)
    expect(d.customSteps).toEqual([{ id: "custom-doc-1", label: "학운위 심의", offsetDays: -41, memo: undefined }]);
    expect(d.career).toEqual({ tracks: ["예체능"], subjects: [], creativeArea: "자율활동", target: "" });
    expect(d.ownerNote).toBeNull(); // 다 비면 null
  });

  it("AI가 돌려준 새 필드 글에도 개인정보를 한 번 더 가린다", () => {
    const d = normalizeDraft({
      ...core,
      candidates: [{ kind: "업체", name: "(가상) 관광", chosen: false, reason: "담당 김민수 010-1111-2222 연락 안 됨" }],
      ownerNote: { good: "학생 홍길동 수상", problem: "", nextYear: "" },
    });
    expect(d.candidates![0].reason).not.toMatch(/김민수|010-1111/);
    expect(d.ownerNote!.good).not.toContain("홍길동");
  });

  it("핵심 필드가 틀리면 실패 (→ 라우트가 고정 초안으로 대체)", () => {
    expect(() => normalizeDraft({ ...core, scope: "기타" })).toThrow();
  });
});

describe("AI 출력 스키마", () => {
  it("새 필드가 모두 required (Gemini 구조화 출력)", () => {
    expect(DRAFT_OUTPUT_SCHEMA.required).toEqual(
      expect.arrayContaining(["budget", "venues", "candidates", "skipped", "customSteps", "career", "ownerNote"]),
    );
  });
});

describe("DEMO_DRAFT — 시연용 새 행사", () => {
  it("캘린더의 기존 행사와 겹치지 않는다", () => {
    expect(events.some((e) => e.title === DEMO_DRAFT.title)).toBe(false);
    expect(DEMO_DRAFT).toMatchObject({ scope: "교외", template: "OUT_DAY", eventDate: "2026-10-16" });
  });

  it("모든 새 필드가 채워져 있다", () => {
    const x = draftExtras(DEMO_DRAFT);
    expect(x.budget?.total).toBe(4800000);
    expect(x.venues).toHaveLength(1);
    expect(x.venues[0].rating).toBe(4);
    expect(x.candidates.filter((c) => c.chosen)).toHaveLength(1);
    expect(x.candidates.filter((c) => !c.chosen)).toHaveLength(2);
    expect(x.skipped).toHaveLength(1);
    expect(x.career?.tracks.length).toBeGreaterThan(0);
    expect(x.ownerNote).toMatchObject({ good: expect.any(String), problem: expect.any(String), nextYear: expect.any(String) });
    expect(DEMO_DRAFT.customSteps).toHaveLength(1);
  });

  it("고정 초안에도 사람 이름·연락처가 없다 (모든 글자 칸)", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(DEMO_DRAFT);
    const text = strings.join("\n");
    expect(maskPersonalInfo(text).maskCount).toBe(0);
    expect(text).not.toMatch(/최유진|박지훈|010-/);
  });

  it("draftToEventCard: 추가 단계가 카드에 들어가 체크리스트에 끼어든다", () => {
    const card = draftToEventCard(DEMO_DRAFT, { id: "U-1", nextEventDate: "2027-10-15", year: 2026, author: "2026 담당 교사" });
    expect(card.customSteps).toEqual([{ id: "custom-doc-1", label: "박람회 단체 사전등록", offsetDays: -30, memo: expect.any(String), author: "2026 담당 교사" }]);
    const s = computeSchedule(card, "2027-03-11");
    const i = s.findIndex((x) => x.id === "custom-doc-1");
    expect(s[i]).toMatchObject({ isCustom: true, dueDate: "2027-09-15", author: "2026 담당 교사" });
    expect(s[i - 1].offsetDays).toBeLessThanOrEqual(-30);
    expect(s[i + 1].offsetDays).toBeGreaterThanOrEqual(-30);
  });

  it("draftExtras: 새 필드가 없는 초안도 null·빈 배열", () => {
    expect(draftExtras(normalizeDraft(core))).toEqual({ budget: null, venues: [], candidates: [], skipped: [], career: null, ownerNote: null });
  });
});

describe("샘플 결과보고서 (마스킹 시연용)", () => {
  const text = readFileSync("docs/sample-upload/2026_박람회견학_결과보고서.txt", "utf8");
  it("이름 2개·전화번호 1개가 가려진다", () => {
    const r = maskPersonalInfo(text);
    expect(r.hits).toEqual(expect.arrayContaining([{ kind: "name", count: 2 }, { kind: "phone", count: 1 }]));
    expect(r.maskedText).not.toMatch(/최유진|박지훈|010-2345-6789/);
    // 행사 정보는 남는다
    expect(r.maskedText).toContain("180명");
    expect(r.maskedText).toContain("4,800,000원");
  });
});
