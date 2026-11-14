import { describe, expect, it } from "vitest";
import { analyzeNoticeFormat, classifySection } from "@/lib/notice/format";
import { composeNotice, formatDate, type NoticeFacts } from "@/lib/notice/compose";

// 실제 학교 통신문의 "구조"만 흉내 낸 가상 레퍼런스 (학교·행사 이름은 지어낸 것)
const ONLINE_REF = `가상 표어 문구입니다
(가상 2026-12호)
가정통신문
담당자: 진로부 ☎ ○○○
제목: 2026년 (2학년) 맞춤형 캠프 안내
  학부모님의 가정에 건강과 행복이 가득하시기를 기원합니다.
  본교에서는 2학년 학생들을 대상으로 캠프를 운영하고자 합니다. 이번 캠프는 학생 단독 또는 학부모가 함께 참여하는 개별 상담 프로그램으로, 학생의 진로 희망과 학업 현황을 분석하고, 선택과목 및 학업 설계, 학교생활기록부 관리 방향, 대입전형에 따른 진학 준비 전략 등을 종합적으로 안내할 예정입니다.
  참가를 희망하는 학생과 학부모님께서는 아래 내용을 확인하시고 참석해 주시기 바랍니다.
1. 프로그램 운영 개요
  가. 일시: 2026. 11. 13.(금) 18:30~21:00
  나. 장소: 2학년 각 반 교실(10개실)
  다. 대상: 2학년 희망 학생(총 30팀)
2. 프로그램 세부 계획
일정
세 부 내 용
비고
1부
18:30~19:20 (50분)
< 참가 신청 방법 안내 >
https://forms.gle/abcdefg
2026년 10월 26일
가 상 고 등 학 교 장`;

const PAPER_REF = `가상 표어
가 정 통 신 문 담당자: 2학년부 ☎ ○○○
제목: 2026학년도 2학년 수학여행 실시 안내
학부모님 가정에 건강과 평안이 가득하시기를 기원합니다.
1. 수학여행 안내
가. 수학여행 일정: 2026. 11. 4.(수) ~ 2026. 11. 6.(금) 2박 3일
나. 장소: 제주도 일원
2. 출발 당일
가. 집합 시간 및 장소: 오전 7시
11. 16.(월) ~ 12. 4.(금) 작품 전시
○ 학생 준비물
- 신분증
- 세면도구
○ 학생 유의사항
- 항상 안전에 유의합니다.
* 일정 및 체험 내용은 사정에 따라 변경될 수 있음
2026 년 10 월 22 일
가 상 고 등 학 교 장`;

const facts: NoticeFacts = {
  schoolName: "인덕고등학교", year: "2027", eventTitle: "2학년 수학여행 (숙박형)", scope: "교외", eventDate: "2027-05-12", nights: "2박 3일",
  venueText: "해솔 리조트", targetText: "2학년 전체", participants: 200, costPerStudent: 300000, costItems: ["교통", "숙박"],
  safetyStaff: "학생 50명당 1명(100명 이상)", safetyEduDate: "2027-05-05", consentDue: "2027-04-01", today: "2027-03-11", discloseDue: "2027-06-01",
  settlement: { income: "5,400만원", items: [{ name: "교통", planned: "1,200만원" }] },
};

describe("레퍼런스 양식 분석", () => {
  it("머리말·번호 체계·신청 방식·날짜 표기·맺음말을 읽는다 (온라인 신청형)", () => {
    const f = analyzeNoticeFormat(ONLINE_REF);
    expect(f).toMatchObject({ hasSlogan: true, hasDocNo: true, hasContact: true, spacedTitle: false, online: true, dateStyle: "dots", spacedSchool: true });
    expect(f.greeting).toBe("학부모님의 가정에 건강과 행복이 가득하시기를 기원합니다.");
    expect(f.sections.map((s) => [s.no, s.title, s.kind])).toEqual([[1, "프로그램 운영 개요", "overview"], [2, "프로그램 세부 계획", "schedule"]]);
    expect(f.sections[0].items).toEqual(["일시", "장소", "대상"]);
    expect(f.introChars).toBeGreaterThan(200);
  });

  it("종이 동의서형: 글자 띄운 제목·○ 블록·주석·'11. 4.(수)' 같은 날짜 줄을 번호 항목으로 착각하지 않는다", () => {
    const f = analyzeNoticeFormat(PAPER_REF);
    expect(f).toMatchObject({ spacedTitle: true, online: false, hasNotes: true, spacedSchool: true });
    expect(f.sections.map((s) => s.title)).toEqual(["수학여행 안내", "출발 당일"]);
    expect(f.blocks).toEqual([{ title: "학생 준비물", bullets: 2 }, { title: "학생 유의사항", bullets: 1 }]);
  });

  it("항목 이름으로 종류를 나눈다", () => {
    expect(classifySection("참가 신청 방법")).toBe("apply");
    expect(classifySection("경비 안내")).toBe("cost");
    expect(classifySection("학생 준비물")).toBe("prep");
    expect(classifySection("행사 일정")).toBe("schedule");
    expect(classifySection("프로그램 운영 개요")).toBe("overview");
    expect(classifySection("출발 당일")).toBe("other");
  });
});

describe("양식에 맞춰 통신문 만들기", () => {
  it("온라인형 레퍼런스: 표어·문서번호·담당자 줄, 가나다 항목, 신청 URL 빈칸, 띄어 쓴 학교장, 종이 동의서 없음", () => {
    const t = composeNotice("consent", facts, analyzeNoticeFormat(ONLINE_REF));
    expect(t).toContain("【학교 표어】\n(【문서번호】호)\n가정통신문\n담당자: 【   】부 ☎ 【   】\n제목: 2027학년도 2학년 수학여행 (숙박형) 안내");
    expect(t).toContain("학부모님의 가정에 건강과 행복이 가득하시기를 기원합니다.");
    expect(t).toContain("1. 행사 운영 개요\n  가. 일시: 2027. 5. 12.(수) 2박 3일\n  나. 장소: 해솔 리조트\n  다. 대상: 2학년 전체(200명)");
    expect(t).toContain("신청 주소(URL): 【   】");
    expect(t).toContain("신청 기한: 2027. 4. 1.(목)");
    expect(t).toMatch(/2027년 3월 11일\n인 덕 고 등 학 교 장$/);
    expect(t).not.toContain("절 취 선");
    expect(t).not.toContain("가상 고등학교"); // 레퍼런스 학교 이름·표어를 가져오지 않는다
  });

  it("종이형 레퍼런스: 띄운 제목·○ 블록·주석·절취선 동의서, 레퍼런스 항목 이름과 하위 항목을 따른다", () => {
    const t = composeNotice("consent", facts, analyzeNoticeFormat(PAPER_REF));
    expect(t).toContain("가 정 통 신 문");
    expect(t).toContain("제목: 2027학년도 2학년 수학여행 (숙박형) 안내 및 참가 동의서");
    expect(t).toContain("1. 수학여행 안내\n  가. 수학여행 일정: 2027. 5. 12.(수) 2박 3일");
    expect(t).toContain("2. 출발 당일\n  가. 집합 시간 및 장소: 【   】");
    expect(t).toContain("○ 학생 준비물\n  - 【   】\n  - 【   】");
    expect(t).toContain("○ 학생 유의사항");
    expect(t).toContain("* 일정 및 내용은 학교 사정에 따라 변경될 수 있음");
    expect(t).toContain("절 취 선");
    expect(t.indexOf("참가 신청 안내")).toBeGreaterThan(t.indexOf("안전 대책")); // 신청·제출은 항상 마지막 번호 항목
  });

  it("레퍼런스가 없으면 기본 구성으로 만든다 (개요·경비·안전·신청 + 절취선)", () => {
    const t = composeNotice("consent", facts, null);
    expect(t).toContain("1. 행사 개요");
    expect(t).toContain("경비 안내");
    expect(t).toContain("안전 대책");
    expect(t).toContain("절 취 선");
    expect(t).toContain("인덕고등학교장");
  });

  it("지난 제출 기한은 빈칸으로 둔다", () => {
    const t = composeNotice("consent", { ...facts, consentDue: null }, null);
    expect(t).toContain("제출 기한: 【   】");
  });

  it("정산 안내는 개요·경비 결과·문의만 남기고 준비물·안전·절취선은 뺀다", () => {
    const t = composeNotice("settlement", facts, analyzeNoticeFormat(PAPER_REF));
    expect(t).toContain("제목: 2027학년도 2학년 수학여행 (숙박형) 경비 정산 안내");
    expect(t).toContain("총 수입: 5,400만원");
    expect(t).toContain("2027. 6. 1.(화)까지 학교 홈페이지에 게시");
    expect(t).not.toContain("○ 학생 준비물");
    expect(t).not.toContain("절 취 선");
    expect(t).not.toContain("안전 대책");
  });

  it("날짜 표기 두 가지", () => {
    expect(formatDate("2027-05-12", "dots")).toBe("2027. 5. 12.(수)");
    expect(formatDate("2027-05-12", "korean")).toBe("2027년 5월 12일(수)");
    expect(formatDate(null, "dots")).toBe("【   】");
  });
});
