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

/** 템플릿에 없는 단계 (전임자가 넘겨준 단계·내가 추가한 단계). id 는 "custom-…" */
export type CustomStepId = `custom-${string}`;
/** 템플릿 단계 + 추가 단계 */
export type AnyStepId = StepId | CustomStepId;
export const isCustomStepId = (id: string): id is CustomStepId => id.startsWith("custom-");

export interface CustomStep {
  id: CustomStepId;
  label: string;
  /** 행사일 기준. 음수 = 행사 전 */
  offsetDays: number;
  memo?: string;
  /** "2026 담당 교사" / "나" */
  author?: string;
}

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
  /** 이 메모가 걸리는 단계(추가 단계 포함). 없으면 행사 전체에 대한 메모 */
  stepId?: AnyStepId;
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
  stepStatus: Partial<Record<AnyStepId, StepState>>;
  /** 템플릿에 없는 단계 (업로드 초안에서 온 단계·전임자가 넘겨준 단계) */
  customSteps?: CustomStep[];
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
  /** 기준 업데이트 확인으로 찾은 변경: 발표일·원문 링크 (없으면 빈 값) */
  publishedAt?: DateString;
  url?: string;
}

// ---------- 공식 기준 변경 감지 (lib/updates/*, POST /api/updates/check) ----------
export interface OfficialSource {
  id: string; // "SRC-MOE"
  name: string;
  type: "law-api" | "press-list" | "portal" | "office-notice";
  url: string;
}

/** 출처에서 가져온 문서 한 건 (시연: data/update-snapshots/*.json) */
export interface OfficialDoc {
  sourceId: string;
  title: string;
  publisher: string;
  publishedAt: DateString;
  url: string;
  /** 직접 쓴 한 줄 요약 (원문 문장 복사 금지) */
  summary: string;
  candidates: (Omit<ChangeAlert, "confirmed"> | { id: string; matchesExisting: string; title: string })[];
}

export interface UpdateCheckResult {
  checkedAt: string; // ISO 시각
  sources: { id: string; name: string; status: "checked" | "found"; newDocs: number }[];
  /** 새로 찾은 기준 변경 후보 — 담당자가 "변경 알림에 추가"해야 반영된다 */
  found: ChangeAlert[];
  /** 이미 등록된(또는 이미 추가한) 변경 id */
  alreadyKnown: string[];
  /** true 면 저장해 둔 시연용 스냅샷으로 돌린 결과 */
  snapshot: boolean;
  snapshotLabel?: string;
  /** 후보를 만든 방식: 스냅샷 그대로 / AI 정리 */
  mode: "snapshot" | "llm";
}

// ---------- 프론트 localStorage 상태 ----------
/** localStorage 키 "handover:v1" 에 이 모양 그대로 저장 */
export interface ClientState {
  stepStatus: Record<string, Partial<Record<AnyStepId, StepState>>>; // eventId → 단계 상태 (추가 단계 포함)
  eventDateOverrides: Record<string, DateString>; // eventId → 바꾼 행사일
  extraNotes: Record<string, HandoverNote[]>; // eventId → 화면에서 추가한 메모
  confirmedChangeIds: string[];
  /** 결과보고서 업로드로 만든 내년도 행사 카드 (draftToEventCard 결과) */
  addedEvents: EventCard[];
  /** "기준 업데이트 확인"에서 담당자가 "변경 알림에 추가"한 기준 변경 (changesWithAdded 로 합쳐 씀) */
  addedChanges?: ChangeAlert[];
  /** "인수인계 받기" 화면에서 읽고 확인한 메모 (noteKey 값) */
  acknowledgedNoteKeys?: string[];
  /** "인수 확인" 버튼을 누른 날. 없으면 아직 인수 전 → 첫 화면에 인수인계 받기 */
  handoverAcceptedAt?: DateString;
  /** 체크리스트 직접 편집: eventId → 내가 추가한 단계 */
  customSteps?: Record<string, CustomStep[]>;
  /** eventId → 단계 id → 이름·마감 수정 (템플릿 단계·추가 단계 모두) */
  stepEdits?: Record<string, Record<string, { label?: string; offsetDays?: number }>>;
  /** eventId → 이 학교에선 안 하는 단계 id (숨김) */
  hiddenSteps?: Record<string, string[]>;
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
  id: AnyStepId;
  label: string;
  offsetDays: number;
  /** 템플릿에 없는 추가 단계면 true (author 와 memo 가 같이 온다) */
  isCustom?: boolean;
  author?: string;
  memo?: string;
  /** stepEdits 로 이름·마감을 고친 단계 */
  edited?: boolean;
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
  stepId?: AnyStepId;
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
  missingSteps: { stepId: AnyStepId; label: string }[];
}

export interface CalendarItem {
  date: DateString;
  eventId: string;
  kind: "event" | "deadline";
  label: string;
  scope: Scope;
  color: "green" | "blue"; // 교내 green, 교외 blue
  stepId?: AnyStepId;
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

/** 결과보고서에서 뽑은 예산 (원 단위, 문서에 없으면 null) */
export interface DraftBudget {
  total: number | null;
  perStudent: number | null;
  /** 학교회계 / 교육청 지원금 / 수익자부담 … */
  sources: { type: string; amount: number | null }[];
  /** 교통 / 숙박 / 식비 … */
  items: { name: string; amount: number | null }[];
  /** "버스 1대 추가로 예산 초과" 같은 한 줄 */
  memo: string;
}
export interface DraftVenue {
  name: string;
  type: string;
  memo: string;
  /** 1~5, 문서에 없으면 null */
  rating: number | null;
}
/** 고민 기록: 후보 비교와 선택·탈락 이유 (결과보고서엔 안 남는 것) */
export interface DraftCandidate {
  kind: "장소" | "업체" | "프로그램" | "일정";
  name: string;
  chosen: boolean;
  /** 선택 이유 또는 탈락 이유 */
  reason: string;
}
export interface DraftCareer {
  tracks: string[];
  subjects: string[];
  creativeArea: string;
  target: string;
}
/** 담당 소감 (이름 없이) */
export interface DraftOwnerNote {
  good: string;
  problem: string;
  nextYear: string;
}

export interface EventDraft {
  title: string;
  scope: Scope;
  template: TemplateId;
  eventDate: DateString | null;
  steps: { stepId: StepId; actualDate: DateString | null; memo: string }[];
  cautions: string[];
  handoverNote: string;
  // ---- 아래는 업로드 한 번으로 카드의 다른 탭까지 채우기 위한 선택 필드 (없으면 null·빈 배열) ----
  budget?: DraftBudget | null;
  venues?: DraftVenue[];
  /** 고민 기록: 후보 비교·탈락 이유 */
  candidates?: DraftCandidate[];
  /** 해보니 불필요했던 과정 */
  skipped?: string[];
  /** 템플릿에 없는데 문서에 나온 단계 (예: 학운위 심의) */
  customSteps?: CustomStep[];
  career?: DraftCareer | null;
  ownerNote?: DraftOwnerNote | null;
}

/** draftExtras(): 카드 밖(프론트 전용 탭)에 저장할 나머지 초안 데이터 */
export interface DraftExtras {
  budget: DraftBudget | null;
  venues: DraftVenue[];
  candidates: DraftCandidate[];
  skipped: string[];
  career: DraftCareer | null;
  ownerNote: DraftOwnerNote | null;
}
