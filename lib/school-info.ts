// 데모 학교 정보. 챗봇 프롬프트와 프론트 화면이 같은 이름을 쓰도록 여기 한 곳에만 둔다.
// (프론트는 npm run sync:backend 로 이 파일을 받아 lib/school.ts 에서 사용)
export const SCHOOL = {
  /** 가상 학교 (인천광역시교육청 소속으로 가정) */
  high: "인덕고등학교",
  middle: "한빛중학교",
  office: "인천광역시교육청",
  dept: "창의적 체험활동부",
} as const;
