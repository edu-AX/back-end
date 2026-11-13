// 공식 출처 어댑터. "기준 업데이트 확인"이 어디서 문서를 가져오는지 정한다.
// 실제 수집은 UpdateSourceAdapter 구현만 바꾸면 되고, 나머지(check.ts·API·화면)는 그대로 쓴다.
import sourcesJson from "@/data/official-sources.json";
import moe20260528 from "@/data/update-snapshots/moe-2026-05-28.json";
import type { DateString, OfficialDoc, OfficialSource } from "../types";

export const officialSources = sourcesJson as OfficialSource[];

/** 시연용 스냅샷 (data/update-snapshots/*.json). 새 스냅샷은 여기 배열에 추가 */
export const SNAPSHOT_DOCS = [moe20260528] as OfficialDoc[];

export interface UpdateSourceAdapter {
  sourceId: string;
  /** since 이후 새 문서. 실제 수집은 이 인터페이스 구현만 바꾸면 된다 */
  fetchSince(since: DateString): Promise<OfficialDoc[]>;
}

/** 시연용: 저장해 둔 스냅샷을 돌려준다 */
export function snapshotAdapter(sourceId: string): UpdateSourceAdapter {
  return {
    sourceId,
    async fetchSince(since) {
      return SNAPSHOT_DOCS.filter((d) => d.sourceId === sourceId && d.publishedAt >= since);
    },
  };
}

/**
 * TODO(실제 연결): 국가법령정보센터 Open API (open.law.go.kr)
 * - 학교안전법 등 대상 법령의 개정 이력·신구법 비교를 조회해서 공포일·시행일 변화를 감지한다.
 * - 바뀐 조문을 OfficialDoc.summary 로 정리하고, candidates 는 check.ts 에서 AI가 만든다.
 */
export const lawApiAdapter: UpdateSourceAdapter = {
  sourceId: "SRC-LAW",
  async fetchSince() {
    throw new Error("not implemented");
  },
};

/**
 * TODO(실제 연결): 정책브리핑 교육부 부처뉴스 목록 (korea.kr, repCode=A00002)
 * - since 이후 새 보도자료 제목·발표일·첨부(hwpx)를 수집하고, 현장체험학습·학생부·학교안전 키워드로 거른다.
 * - 원문 문장은 저장하지 않고 직접 쓴 요약만 OfficialDoc.summary 에 둔다.
 */
export const pressListAdapter: UpdateSourceAdapter = {
  sourceId: "SRC-MOE",
  async fetchSince() {
    throw new Error("not implemented");
  },
};

/** 출처별 어댑터 고르기. 시연(snapshot=true)에서는 모든 출처를 스냅샷 어댑터로 확인한다 */
export function adapterFor(sourceId: string, snapshot: boolean): UpdateSourceAdapter {
  if (snapshot) return snapshotAdapter(sourceId);
  if (sourceId === "SRC-LAW") return lawApiAdapter;
  if (sourceId === "SRC-MOE") return pressListAdapter;
  return snapshotAdapter(sourceId); // 포털·교육청 공지는 아직 스냅샷만
}
