// DEMO_MODE 고정 답변. 인터넷이 끊기거나 API가 실패해도 발표 시나리오가 돌아가게 한다.
// 순서가 중요하다: 위에서부터 먼저 맞는 것을 쓴다.
import { LEGAL_NOTE } from "./messages";

export interface DemoAnswer {
  key: "liability" | "lastYear" | "record" | "consent" | "safetyStaff";
  match: RegExp;
  answer: string;
  sourceIds: string[];
}

export const DEMO_ANSWERS: DemoAnswer[] = [
  {
    key: "liability",
    match: /(면책|책임|사고 ?(나|가)|소송|처벌)/,
    answer:
      "현행 기준은 교사가 안전조치 의무를 다한 경우 책임을 면할 수 있다는 거예요(학교안전법). " +
      "'고의·중과실이 없으면 면책'하도록 바꾸는 개정안이 추진 중이지만 아직 국회 통과가 확인되지 않았어요. " +
      "그래서 지금은 현행 기준이 그대로 적용돼요.\n\n" +
      LEGAL_NOTE,
    sourceIds: ["G-NAT-02", "G-NAT-03", "C-02"],
  },
  {
    key: "lastYear",
    match: /(작년|전임|지난 ?해|예전).{0,12}(어떻게|뭐|무슨|문제|주의|했)/,
    answer:
      "작년 2학년 수학여행은 제주 2박 3일로 진행됐어요(176명). 전임 선생님이 꼭 남긴 건 두 가지예요. " +
      "① 사전답사 때 숙소 비상구 확인을 놓쳐 4월에 다시 확인했으니, 올해는 사전답사(3월 13일 마감) 때 비상구·동선을 사진으로 남기세요. " +
      "② 동의서 배부 전에 학부모 설명회를 먼저 하니 동의율이 86%까지 올랐대요.",
    sourceIds: ["E-07"],
  },
  {
    key: "record",
    match: /(글자|자수|몇 ?자|특기사항|행동특성|종합의견|학생부|기재)/,
    answer:
      "2026학년도 기재요령부터 창체 진로활동 특기사항은 700자에서 500자로, 행동특성 및 종합의견은 500자에서 300자로 줄었어요(전 학년, 전국 공통). " +
      "작년 방식과 달라졌으니 담임 선생님께 학생부 입력을 안내할 때 올해 기준으로 알려 주세요.",
    sourceIds: ["G-NAT-01", "C-01"],
  },
  {
    key: "consent",
    match: /(동의율|동의서|동의|몇 ?%|퍼센트)/,
    answer:
      "인천광역시교육청 기준으로, 숙박형 수학여행은 학년 전체 학부모의 80% 이상이 동의해야 추진할 수 있어요. " +
      "2학년 수학여행 카드의 '학생·학부모 의견 수렴 / 동의서' 단계에서 동의율을 집계해 두세요. 카드에는 명단 말고 '동의율 82%'처럼 숫자만 남기면 돼요.",
    sourceIds: ["G-INC-01", "E-07"],
  },
  {
    key: "safetyStaff",
    match: /(안전 ?요원|안전 ?인력|보조 ?인력|몇 ?명)/,
    answer:
      "인천광역시교육청 기준으로, 참가 학생이 100명 이상이면 학생 50명당 안전요원 1명을 배치해요. " +
      "2학년 수학여행은 180명이 참가하니 최소 4명이 필요해요.",
    sourceIds: ["G-INC-01", "E-07"],
  },
];

export function findDemoAnswer(question: string): DemoAnswer | null {
  return DEMO_ANSWERS.find((d) => d.match.test(question)) ?? null;
}
