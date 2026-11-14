// 업로드 문서의 개인정보를 AI에 넘기기 전에 가린다 (정규식 기반).
// 한계: 이름은 문맥("학생 OOO", "OOO 학부모")과 성씨 목록으로만 잡으므로 100%는 아니다.
// 그래서 반드시 마스킹 미리보기를 사용자에게 보여주고 확인받은 뒤 AI로 넘긴다.
import type { MaskKind, MaskResult } from "./types";

export const MASK = "○○○";

// 흔한 한국 성씨 (첫 글자)
const SURNAMES =
  "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경";

// 이름처럼 보이지만 일반 명사인 말 (앞 두 글자로도 검사 → "안전교육"도 걸러짐)
const NOT_NAMES = new Set([
  "인솔", "담임", "담당", "참가", "전체", "해당", "지도", "보건", "체육", "학년", "우리", "모든",
  "일부", "남자", "여자", "대표", "각반", "반장", "부장", "교감", "교장", "신규", "기간", "보조",
  "안전", "진로", "동아", "학급", "전학", "재학", "졸업", "신입", "인원", "명단", "이상", "이하",
  "이번", "작년", "올해", "내년", "주의", "확인", "연락", "비상", "사전", "현장", "방과", "정보",
  "수학", "영어", "국어", "과학", "사회", "음악", "미술", "기술", "가정", "한국", "전원", "다수",
  "소수", "개별", "모두", "각자", "본인", "상대", "주관", "주최", "운영", "협조", "명이", "이름",
  "성명", "학부", "보호", "교사", "학생", "선생", "강사", "기사", "구급", "숙소", "버스", "차량",
  // 결과보고서에 자주 나오는 업무 명사 (성씨로 시작해 이름처럼 보이는 것들)
  "안내", "추가", "소감", "신청", "배치", "회의", "연수", "교육", "업무", "문의", "변경", "교체",
  "선정", "계약", "결과", "소개", "모집", "배정", "면담", "상담", "출장", "회신", "협의", "인계",
  "인수", "지원", "지참", "유의", "도슨", "진행", "준비", "정산", "보고", "공지", "제출", "조사", "점검", "관리", "참여",
]);

const PARTICLES = "은는이가을를의에도와과께만";

const ROLE_BEFORE = "(?:학생|학부모|보호자|담임|교사|선생님|담당자?|인솔자?|강사|기사)";
const ROLE_AFTER = "(?:학생|학부모|어머니|아버지|어머님|아버님|보호자|선생님|교사|담임|군|양)";

/** 후보 문자열에서 실제 이름 부분을 돌려준다. 이름이 아니면 null */
function pickName(candidate: string): string | null {
  let v = candidate;
  if (v.length >= 3 && PARTICLES.includes(v[v.length - 1])) v = v.slice(0, -1); // "홍길동은" → "홍길동"
  if (v.length < 2 || v.length > 4) return null;
  if (!SURNAMES.includes(v[0])) return null;
  if (NOT_NAMES.has(v) || NOT_NAMES.has(v.slice(0, 2))) return null;
  return v;
}

interface Rule {
  kind: MaskKind;
  re: RegExp;
  /** 매치에서 가릴 그룹 번호 (없으면 매치 전체를 가림) */
  group?: number;
  /** 그룹 값에서 실제로 가릴 부분을 고른다. null 이면 가리지 않음 */
  pick?: (value: string) => string | null;
}

const RULES: Rule[] = [
  // 주민등록번호 (먼저 처리해야 다른 숫자 규칙이 쪼개지 않음)
  { kind: "rrn", re: /(?<!\d)\d{6}\s*-\s*[1-4]\d{6}(?!\d)/g },
  // 휴대폰·일반전화: 010-1234-5678, 01012345678, 032-123-4567
  { kind: "phone", re: /(?<!\d)(?:01[016789]|0[2-6]\d?)[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g },
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 학번: "학번 20315", "학번: 2-3-15"
  { kind: "studentId", re: /(학번\s*[:：]?\s*)(\d[\d-]{3,9})/g, group: 2 },
  // 문맥 없는 5자리 학번형 숫자 (1~3학년으로 시작). 금액·인원 등 단위가 붙으면 제외
  { kind: "studentId", re: /(?<![\d,.-])[1-3]\d{4}(?!\d|[.,-]\d)(?!\s*(?:원|명|개|건|회|km|m|번지))/g },
  // "학생 홍길동", "담임: 김철수", "담당 교사: 최유진"
  // 역할어는 뒤돌아보기(lookbehind)로만 확인해서 소비하지 않는다 → "담당 교사"의 "교사"를 후보로 버려도 바로 뒤 이름을 다시 본다
  { kind: "name", re: new RegExp(`(?<=${ROLE_BEFORE}(?:\\s+|\\s*[:：]\\s*))([가-힣]{2,5})(?![가-힣])`, "g"), group: 1, pick: pickName },
  // "홍길동 학생", "김영희 어머니", "박민수(2-3)" — 이름은 2~3글자, 괄호 안은 반-번호 꼴만
  {
    kind: "name",
    re: new RegExp(`(?<![가-힣])([가-힣]{2,3})(?=\\s*(?:${ROLE_AFTER}|\\(\\s*\\d+\\s*-\\s*\\d))`, "g"),
    group: 1,
    pick: pickName,
  },
];

export function maskPersonalInfo(text: string): MaskResult {
  let out = text;
  const counts = new Map<MaskKind, number>();
  const bump = (k: MaskKind) => counts.set(k, (counts.get(k) ?? 0) + 1);

  for (const rule of RULES) {
    out = out.replace(rule.re, (match: string, ...args: unknown[]) => {
      if (rule.group === undefined) {
        bump(rule.kind);
        return MASK;
      }
      const value = args[rule.group - 1] as string | undefined;
      if (!value) return match;
      const target = rule.pick ? rule.pick(value) : value;
      if (!target) return match;
      // 이 규칙들에서 가릴 그룹은 항상 매치의 끝부분에 있다
      const start = match.length - value.length;
      bump(rule.kind);
      return match.slice(0, start) + MASK + value.slice(target.length);
    });
  }

  const hits = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return { maskedText: out, maskCount: hits.reduce((n, h) => n + h.count, 0), hits };
}
