// 질문에서 어떤 행사 얘기인지 알아낸다 (데모 모드 고정 답을 행사별로 만들기 위해).
// 1) 별칭 표 → 2) 행사 제목의 핵심어 → 3) 지금 열려 있는 카드(focusEventId) → 4) 없음(null)
import type { EventCard } from "../types";

interface Alias {
  id: string;
  keys: string[];
  /** 이 말이 질문에 있으면 이 별칭은 건너뛴다 (예: 1일형인데 '숙박'을 말하면 아님) */
  unless?: RegExp;
}

const ALIASES: Alias[] = [
  { id: "E-07", keys: ["수학여행"] },
  { id: "E-05", keys: ["수련활동", "수련회"] },
  { id: "E-03", keys: ["체육대회", "체육 대회"] },
  { id: "E-01", keys: ["발대식", "동아리 조직"] },
  { id: "E-02", keys: ["1일형", "일일형", "현장체험학습", "현장 체험학습"], unless: /숙박/ },
  { id: "E-06", keys: ["축제", "발표회"] },
  { id: "E-04", keys: ["진로체험", "진로 체험"] },
];

/** "2학년 수학여행 (숙박형)" → "수학여행" */
function titleCore(title: string): string {
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/^\s*\d학년\s*/, "")
    .trim();
}

export function detectEvent(question: string, events: EventCard[], focusEventId?: string): EventCard | null {
  const q = question.replace(/\s+/g, " ");
  const byId = (id: string) => events.find((e) => e.id === id) ?? null;

  for (const a of ALIASES) {
    if (a.unless?.test(q)) continue;
    if (a.keys.some((k) => q.includes(k))) {
      const ev = byId(a.id);
      if (ev) return ev;
    }
  }
  // 별칭 표에 없는 행사(업로드로 추가한 행사 등): 제목 핵심어(공백 기준 첫 덩어리 2자 이상)
  for (const ev of events) {
    const core = titleCore(ev.title);
    const head = core.split(/[ ·]/)[0];
    if ((core.length >= 2 && q.includes(core)) || (head.length >= 3 && q.includes(head))) return ev;
  }
  if (focusEventId) return byId(focusEventId);
  return null;
}
