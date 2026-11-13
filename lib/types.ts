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
  /** 고정 id (data 에 적힌 메모). 화면에서 추가한 메모는 없을 수 있음 → noteKey() 사용 */
  id?: string;
  year: number;
  note: string;
  author?: string; // 가상 이름 또는 "전임자"
  /** 이 메모가 걸리는 단계. 없으면 행사 전체에 대한 메모 */
  stepId?: StepId;
  /** true 면 "인수인계 받기" 화면의 핵심 주의점에 뜬다 */
  important?: boolean;
}

/** 작년에 이 행사를 실제로 어떻게 했는지 (전임자 기록) */
export interface LastYearStep {
  /** 실제로 한 날짜. 모르면 null */
  actualDate: DateString | null;
  /** 그때 한 일·결과 한 줄 (예: "○○관광 계약, 예산 내") */
  memo?: string;
  /** 문제가 있었으면 true → 화면에서 강조 */
  hadIssue?: boolean;
}
export interface LastYearRecord {
  year: number;
  eventDate: DateString;
  /** 담당자 표시용 (실명 대신 "2026 담당 교사" 같은 표기) */
  owner: string;
  /** 한두 문장 총평 */
  summary: string;
  participants?: number;
  /** 업체·기관명 (개인 이름·연락처는 넣지 않음) */
  partners?: string[];
  steps: Partial<Record<StepId, LastYearStep>>;
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
  /** 작년 실제 기록. 없으면 올해가 첫 해 */
  lastYear?: LastYearRecord;
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
  /** "인수인계 받기" 화면에서 읽고 확인한 메모 (noteKey 값) */
  acknowledgedNoteKeys?: string[];
  /** "인수 확인" 버튼을 누른 날. 없으면 아직 인수 전 → 첫 화면에 인수인계 받기 */
  handoverAcceptedAt?: DateString;
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
  /** 작년에 이 단계를 실제로 한 기록 (있으면) */
  lastYear?: LastYearStep & {
    /** 작년 행사일 기준 며칠 전/후에 했는지 (음수=전) */
    offsetDays: number | null;
    /** 올해 권장 마감보다 늦게 했으면 양수 (일) */
    lateByDays: number | null;
  };
  /** 이 단계에 붙은 전임자 메모 */
  notes: HandoverNote[];
}

// ---------- 인수인계 (lib/handover.ts) ----------
export interface HandoverPoint {
  key: string; // noteKey
  eventId: string;
  eventTitle: string;
  stepId?: StepId;
  stepLabel?: string;
  note: string;
  year: number;
  author?: string;
  acknowledged: boolean;
}

export interface HandoverBrief {
  /** 전임자 표기 목록 (예: ["2026 담당 교사"]) */
  from: string[];
  fromYear: number | null;
  accepted: boolean;
  acceptedAt?: DateString;
  /** 꼭 알아야 할 핵심 주의점 (important 메모) */
  keyPoints: HandoverPoint[];
  /** 작년과 달라진 기준 (확인 안 한 변경 알림 먼저) */
  changes: {
    id: string;
    title: string;
    before: string;
    after: string;
    status: GuidelineStatus;
    eventIds: string[];
    confirmed: boolean;
  }[];
  /** 행사별 한 줄: 작년엔 어땠고 올해는 언제인지 */
  events: {
    eventId: string;
    title: string;
    scope: Scope;
    eventDate: DateString;
    dDay: number;
    lastYearDate: DateString | null;
    lastYearSummary: string | null;
    noteCount: number;
    issueCount: number;
  }[];
  /** 확인한 메모 수 / 전체 메모 수 */
  progress: { acknowledged: number; total: number };
}

/** "작년 이맘때" 항목 */
export interface LastYearThisTime {
  eventId: string;
  eventTitle: string;
  stepId: StepId;
  stepLabel: string;
  lastYearDate: DateString;
  /** 오늘과 작년 날짜(1년 뒤로 옮긴 값) 차이. 음수면 작년엔 이미 지난 시점 */
  daysFromToday: number;
  memo?: string;
  hadIssue?: boolean;
}

/** 넘기기 모드: 행사별 인수인계 작성률 */
export interface HandoverCoverage {
  eventId: string;
  title: string;
  /** 단계 중 기록(실제 날짜 또는 메모)이 있는 단계 수 */
  recordedSteps: number;
  totalSteps: number;
  noteCount: number;
  percent: number;
  missingSteps: { stepId: StepId; label: string }[];
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
