import { describe, expect, it } from "vitest";
import { maskPersonalInfo } from "@/lib/masking";

const m = (s: string) => maskPersonalInfo(s).maskedText;

describe("개인정보 마스킹", () => {
  it("전화번호", () => {
    expect(m("연락처 010-1234-5678")).toBe("연락처 ○○○");
    expect(m("연락처 01012345678")).toBe("연락처 ○○○");
    expect(m("행정실 032-123-4567")).toBe("행정실 ○○○");
  });

  it("학번·주민번호·이메일", () => {
    expect(m("학번 20315 학생")).toBe("학번 ○○○ 학생");
    expect(m("학번: 2-3-15")).toBe("학번: ○○○");
    expect(m("명단 20315, 20316")).toBe("명단 ○○○, ○○○");
    expect(m("080512-3123456")).toBe("○○○");
    expect(m("메일 kim@school.kr 로")).toBe("메일 ○○○ 로");
  });

  it("문맥으로 이름 찾기", () => {
    expect(m("담임: 김철수")).toBe("담임: ○○○");
    expect(m("홍길동 학생이 넘어짐")).toBe("○○○ 학생이 넘어짐");
    expect(m("학생 홍길동은 보건실로")).toBe("학생 ○○○은 보건실로");
    expect(m("김영희 어머니께 연락")).toBe("○○○ 어머니께 연락");
    expect(m("박민수(2-3) 귀가")).toBe("○○○(2-3) 귀가");
  });

  it("일반 행사 문장은 건드리지 않는다", () => {
    const s =
      "참가 학생 180명, 인솔 교사 6명, 안전요원 4명. 비용 15000원. 2027-05-12 출발. 학생 안전교육 실시. 체육 교사 협조.";
    expect(m(s)).toBe(s);
  });

  it("역할어가 둘 이어져도 뒤의 이름을 가린다 (\"담당 교사: 최유진\")", () => {
    expect(m("담당 교사: 최유진 (문의 010-2345-6789)")).toBe("담당 교사: ○○○ (문의 ○○○)");
  });

  it("결과보고서의 업무 명사는 이름으로 보지 않는다", () => {
    const s =
      "진로활동 특기사항 담임 안내. 버스 1대 추가(70만원). 6. 담당자 소감. 부스를 사전 신청해서 학생별 상담. 담당 교사 협의.";
    expect(m(s)).toBe(s);
  });

  it("무엇을 몇 개 가렸는지 알려준다 (원문 값은 담지 않음)", () => {
    const r = maskPersonalInfo("담임: 김철수, 010-1234-5678, 홍길동 학생");
    expect(r.maskCount).toBe(3);
    expect(r.hits).toEqual(
      expect.arrayContaining([
        { kind: "phone", count: 1 },
        { kind: "name", count: 2 },
      ]),
    );
    expect(JSON.stringify(r.hits)).not.toContain("김철수");
  });
});
