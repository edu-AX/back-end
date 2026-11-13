// 프론트와 백엔드가 같이 쓰는 타입. 이 파일이 "합의된 계약"입니다.
// 바꿀 때는 프론트 담당에게 먼저 알려주세요.

/** "YYYY-MM-DD" 형식의 날짜 문자열 (시간대 없음) */
export type DateString = string;

export type Scope = "교내" | "교외";
export type SchoolLevel = "middle" | "high";
export type GuidelineStatus = "시행" | "추진 중";
export type StepState = "todo" | "done";

/** 단계 id — templates.json 과 events.json 의 stepStatus 키가 반드시 이 값 중 하나 */
export const STEP_IDS = [
  "plan", // 계획 수립·학교교육계획 반영
  "consent", // 학생·학부모 의견 수렴 / 동의서
  "vendor", // 업체 선정·계약, 사전답사
  "safety_staff", // 안전요원·보조인력 배치 확정
  "safety_edu", // 학생·교사 사전 안전교육
  "execute", // 실시·임장지도
  "report", // 결과 보고·정산
  "record", // 학생부 입력 안내(담임)
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type TemplateId = "OUT_OVERNIGHT" | "OUT_DAY" | "IN_SCHOOL";

// ---------- templates.json ----------
export interface TemplateStep {
  id: StepId;
  label: string;
  /** 행사일 기준 며칠 전(음수)/후(양수). 데모용 예시값이며 법적 기한이 아님 */
  offsetDays: number;
}
export interface Template {
  id: TemplateId;
  name: string;
  scope: Scope;
  steps: TemplateStep[];
}

// ---------- events.json ----------
export interface OfficeRules {
  office: string; // 예: "인천"
  consentRate?: string;
  safetyStaff?: string;
  sourceId: string; // guidelines.json 의 id
}
export interface HandoverNote {
  year: number;
  note: string;
  author?: string; // 가상 이름 또는 "전임자"
}
export interface EventCard {
  id: string; // "E-07"
  department: string;
  schoolLevel: SchoolLevel;
  title: string;
  scope: Scope;
  eventDate: DateString;
  grade?: number;
  participants?: number;
  template: TemplateId;
  officeRules?: OfficeRules;
  handoverNotes: HandoverNote[];
  stepStatus: Partial<Record<StepId, StepState>>;
  changeAlertIds: string[];
  /** 카드에 보여줄 "누가 언제 수정" (보안 설계: 수정 이력) */
  updatedBy?: string;
  updatedAt?: DateString;
}

// ---------- guidelines.json ----------
export interface GuidelineSection {
  id: string; // "s1"
  heading: string;
  text: string;
}
export interface Guideline {
  id: string; // "G-INC-01"
  title: string;
  year: number;
  status: GuidelineStatus;
  scope: string; // "전국" 또는 교육청명
  baseDate: DateString; // 기준일
  sections: GuidelineSection[];
  sourceUrl: string;
  sourceName: string;
  /** true 면 원문으로 숫자를 아직 확인하지 않은 데모 데이터 */
  needsVerification?: boolean;
}

// ---------- changes.json ----------
export interface ChangeAlert {
  id: string; // "C-01"
  /** 이 변경이 걸리는 행사들 (기획서의 eventId를 여러 개로 확장) */
  eventIds: string[];
  /** 걸리는 단계. 행사 전체에 걸리면 null */
  stepId: StepId | null;
  title: string;
  before: string;
  after: string;
  status: GuidelineStatus;
  source: string;
  guidelineId: string;
  /** 데이터 상의 기본값. 실제 "확인함" 여부는 프론트 localStorage(ClientState)가 우선 */
  confirmed: boolean;
}

// ---------- 프론트 localStorage 상태 ----------
/** localStorage 키 "handover:v1" 에 이 모양 그대로 저장 */
export interface ClientState {
  stepStatus: Record<string, Partial<Record<StepId, StepState>>>; // eventId → 단계 상태
  eventDateOverrides: Record<string, DateString>; // eventId → 바꾼 행사일
  extraNotes: Record<string, HandoverNote[]>; // eventId → 화면에서 추가한 메모
  confirmedChangeIds: string[];
  /** 결과보고서 업로드로 만든 내년도 행사 카드 (draftToEventCard 결과) */
  addedEvents: EventCard[];
}
export const EMPTY_CLIENT_STATE: ClientState = {
  stepStatus: {},
  eventDateOverrides: {},
  extraNotes: {},
  confirmedChangeIds: [],
  addedEvents: [],
};

// ---------- 계산 결과 (lib/schedule.ts, lib/dashboard.ts) ----------
export interface ScheduledStep {
  id: StepId;
  label: string;
  offsetDays: number;
  dueDate: DateString;
  state: StepState;
  /** 오늘 기준 마감까지 남은 날 (음수면 지남) */
  daysLeft: number;
  overdue: boolean;
  /** 이 단계에 걸린 확인 안 한 변경 알림 */
  alertIds: string[];
}

export interface CalendarItem {
  date: DateString;
  eventId: string;
  kind: "event" | "deadline";
  label: string;
  scope: Scope;
  color: "green" | "blue"; // 교내 green, 교외 blue
  stepId?: StepId;
  hasAlert: boolean;
  done?: boolean;
}

export interface DashboardSummary {
  today: DateString;
  upcoming: {
    eventId: string;
    title: string;
    scope: Scope;
    eventDate: DateString;
    dDay: number; // 행사일까지 남은 날
    nextStep: ScheduledStep | null;
  }[];
  progress: { eventId: string; title: string; done: number; total: number; percent: number }[];
  thisWeek: (ScheduledStep & { eventId: string; eventTitle: string })[];
  overdue: (ScheduledStep & { eventId: string; eventTitle: string })[];
  unconfirmedAlertCount: number;
}

// ---------- /api/chat ----------
export interface ChatRequest {
  question: string;
  /** 지금 열려 있는 행사 카드 (있으면 답변에서 우선) */
  focusEventId?: string;
}
export interface SourceRef {
  id: string;
  kind: "event" | "guideline" | "change";
  label: string; // 칩에 그대로 보여줄 글자
  status?: GuidelineStatus; // "추진 중"이면 주황 칩
  baseDate?: DateString;
  /** 칩을 눌렀을 때 열 행사 카드 */
  openEventId?: string;
}
export interface ChatResponse {
  answer: string;
  sources: SourceRef[];
  notFound: boolean;
  /** llm: 실제 AI / demo: 고정 답 / blocked: 개인정보 차단 / fallback: API 오류로 고정 답 */
  mode: "llm" | "demo" | "blocked" | "fallback";
  disclaimer: string;
}

// ---------- /api/upload ----------
export interface MaskResult {
  maskedText: string;
  maskCount: number;
  /** 무엇을 가렸는지 (원문 값은 담지 않음) */
  hits: { kind: MaskKind; count: number }[];
}
export type MaskKind = "phone" | "studentId" | "rrn" | "email" | "name";

export interface EventDraft {
  title: string;
  scope: Scope;
  template: TemplateId;
  eventDate: DateString | null;
  steps: { stepId: StepId; actualDate: DateString | null; memo: string }[];
  cautions: string[];
  handoverNote: string;
}
