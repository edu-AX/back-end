// 질문에서 어떤 행사 얘기인지 알아낸다 (데모 모드 고정 답을 행사별로 만들기 위해).
// 1) 별칭 표 → 2) 행사 제목의 핵심어 → 3) 지금 열려 있는 카드(focusEventId) → 4) 없음(null)
// 프론트에만 있는 행사(E-08~E-13)도 별칭으로 알아보지만, 백엔드 데이터에는 없으므로 event 는 null 이다.
import type { EventCard } from "../types";

interface Alias {
  id: string;
  /** 백엔드 데이터에 없는 행사(프론트 data/extra-events.json)의 표시용 제목 */
  title?: string;
  keys: string[];
  /** 이 말이 질문에 있으면 이 별칭은 건너뛴다 (예: 1일형인데 '숙박'을 말하면 아님) */
  unless?: RegExp;
}

/** 위에서부터 먼저 맞는 것. 겹치는 말은 더 구체적인 행사를 위에 둔다 */
const ALIASES: Alias[] = [
  { id: "E-07", keys: ["수학여행"] },
  { id: "E-05", keys: ["수련활동", "수련회"] },
  { id: "E-03", keys: ["체육대회", "체육 대회"] },
  { id: "E-01", keys: ["발대식", "동아리 조직"] },
  // '축제'는 두 행사가 겹친다: 독서·토론이 같이 있으면 인문학 독서 토론 축제(E-11), 아니면 학교 축제(E-06)
  { id: "E-11", title: "인문학 독서 토론 축제", keys: ["인문학", "독서", "토론"] },
  { id: "E-06", keys: ["축제", "발표회"], unless: /독서|토론/ },
  { id: "E-08", title: "대학 연계 메이커·코딩 캠프", keys: ["메이커", "코딩", "캠프"] },
  { id: "E-09", title: "과학관·연구소 탐방", keys: ["과학관", "연구소", "탐방"] },
  { id: "E-10", title: "보건·의료 직업인 특강", keys: ["직업인 특강", "보건·의료", "보건 의료", "의료 직업", "보건 직업", "의료 특강"] },
  { id: "E-12", title: "모의 법정·모의 국회", keys: ["모의 법정", "모의법정", "모의 국회", "모의국회"] },
  { id: "E-13", title: "초등학교 교육 봉사", keys: ["교육 봉사", "교육봉사", "초등학교 봉사", "봉사"] },
  { id: "E-04", keys: ["진로체험", "진로 체험"] },
  { id: "E-02", keys: ["1일형", "일일형", "현장체험학습", "현장 체험학습"], unless: /숙박/ },
];

export interface DetectedEvent {
  id: string;
  title: string;
  /** 백엔드 데이터에 있는 행사면 카드, 프론트에만 있는 행사면 null */
  event: EventCard | null;
}

/** "2학년 수학여행 (숙박형)" → "수학여행" */
function titleCore(title: string): string {
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/^\s*\d학년\s*/, "")
    .trim();
}

function resolve(id: string, events: EventCard[]): DetectedEvent | null {
  const ev = events.find((e) => e.id === id);
  if (ev) return { id, title: ev.title, event: ev };
  const alias = ALIASES.find((a) => a.id === id && a.title);
  return alias ? { id, title: alias.title!, event: null } : null;
}

export function detectEvent(question: string, events: EventCard[], focusEventId?: string): DetectedEvent | null {
  const q = question.replace(/\s+/g, " ");

  for (const a of ALIASES) {
    if (a.unless?.test(q)) continue;
    if (a.keys.some((k) => q.includes(k))) {
      const hit = resolve(a.id, events);
      if (hit) return hit;
    }
  }
  // 별칭 표에 없는 행사(업로드로 추가한 행사 등): 제목 핵심어
  for (const ev of events) {
    const core = titleCore(ev.title);
    const head = core.split(/[ ·]/)[0];
    if ((core.length >= 2 && q.includes(core)) || (head.length >= 3 && q.includes(head))) {
      return { id: ev.id, title: ev.title, event: ev };
    }
  }
  if (focusEventId) return resolve(focusEventId, events) ?? { id: focusEventId, title: focusEventId, event: null };
  return null;
}
