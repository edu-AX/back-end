import { describe, expect, it } from "vitest";
import { changes, events, guidelines, templates } from "@/lib/data";
import { validateData } from "@/lib/validate";

describe("샘플 데이터", () => {
  it("id 참조가 모두 맞는다", () => {
    expect(validateData({ events, templates, guidelines, changes })).toEqual([]);
  });

  it("행사 7개, 템플릿 3개, 변경 알림 2개 (기획서 범위)", () => {
    expect(events).toHaveLength(7);
    expect(templates.map((t) => t.id).sort()).toEqual(["IN_SCHOOL", "OUT_DAY", "OUT_OVERNIGHT"]);
    expect(changes.map((c) => [c.id, c.status])).toEqual([
      ["C-01", "시행"],
      ["C-02", "추진 중"],
    ]);
  });

  it("validateData 가 잘못된 참조를 잡아낸다", () => {
    const broken = structuredClone(events);
    broken[0].changeAlertIds = ["C-99"];
    broken[1].stepStatus = { nope: "done" } as never;
    const errors = validateData({ events: broken, templates, guidelines, changes });
    expect(errors.some((e) => e.includes("C-99"))).toBe(true);
    expect(errors.some((e) => e.includes("nope"))).toBe(true);
  });
});
