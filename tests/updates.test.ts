// 작업 지시서 2 — 작업 B: 공식 기준 변경 감지
import { describe, expect, it, vi } from "vitest";
import { ADDED_SAFETY_NOTE, answerQuestion } from "@/lib/chat/answer";
import { buildCalendar, buildDashboard } from "@/lib/dashboard";
import { changes, changesWithAdded, events, getEvent, guidelines, templates } from "@/lib/data";
import { buildHandoverBrief } from "@/lib/handover";
import { computeSchedule } from "@/lib/schedule";
import { EMPTY_CLIENT_STATE, STEP_IDS, type ChangeAlert, type ClientState } from "@/lib/types";
import { checkOfficialUpdates } from "@/lib/updates/check";
import { lawApiAdapter, officialSources, pressListAdapter, SNAPSHOT_DOCS } from "@/lib/updates/sources";
import { validateData } from "@/lib/validate";

const TODAY = "2027-03-11";
const NOW = new Date("2026-11-14T00:00:00Z");
const demoOpts = { demoMode: true, callLlm: null, now: NOW };

async function c03(): Promise<ChangeAlert> {
  const r = await checkOfficialUpdates(changes, demoOpts);
  return r.found[0];
}
const withC03 = async (): Promise<ClientState> => ({ ...EMPTY_CLIENT_STATE, addedChanges: [await c03()] });

describe("데이터", () => {
  it("출처 4곳, 스냅샷 후보가 실제 행사·단계·지침을 가리킨다", () => {
    expect(officialSources.map((s) => s.id)).toEqual(["SRC-LAW", "SRC-MOE", "SRC-STAR", "SRC-ICE"]);
    for (const doc of SNAPSHOT_DOCS) {
      for (const c of doc.candidates) {
        if ("matchesExisting" in c) {
          expect(changes.some((x) => x.id === c.matchesExisting)).toBe(true);
          continue;
        }
        for (const id of c.eventIds) expect(getEvent(id), id).toBeDefined();
        if (c.stepId) expect(STEP_IDS).toContain(c.stepId);
        expect(guidelines.some((g) => g.id === c.guidelineId)).toBe(true);
      }
    }
  });

  it("G-NAT-04 추가 후에도 validate 통과", () => {
    expect(guidelines.find((g) => g.id === "G-NAT-04")).toMatchObject({ status: "추진 중" });
    expect(validateData({ events, templates, guidelines, changes })).toEqual([]);
  });

  it("실제 수집 어댑터는 아직 미구현", async () => {
    await expect(lawApiAdapter.fetchSince("2026-01-01")).rejects.toThrow("not implemented");
    await expect(pressListAdapter.fetchSince("2026-01-01")).rejects.toThrow("not implemented");
  });
});

describe("checkOfficialUpdates (스냅샷)", () => {
  it("새 변경 1건(C-03), 이미 등록된 변경 C-02", async () => {
    const r = await checkOfficialUpdates(changes, demoOpts);
    expect(r.found.map((c) => c.id)).toEqual(["C-03"]);
    expect(r.found[0]).toMatchObject({
      status: "추진 중",
      stepId: "safety_staff",
      eventIds: ["E-02", "E-05", "E-07"],
      confirmed: false,
      publishedAt: "2026-05-28",
    });
    expect(r.alreadyKnown).toEqual(["C-02"]);
    expect(r).toMatchObject({ snapshot: true, mode: "snapshot" });
    expect(r.snapshotLabel).toContain("2026.5.28 교육부");
    expect(r.sources).toHaveLength(4);
    expect(r.sources.find((s) => s.id === "SRC-MOE")).toMatchObject({ status: "found", newDocs: 1 });
    expect(r.sources.filter((s) => s.status === "checked")).toHaveLength(3);
  });

  it("이미 추가한 C-03 은 다시 찾지 않는다", async () => {
    const r = await checkOfficialUpdates(changesWithAdded(await withC03()), demoOpts);
    expect(r.found).toEqual([]);
    expect(r.alreadyKnown.sort()).toEqual(["C-02", "C-03"]);
  });

  it("키가 있으면 AI가 후보를 정리 (스냅샷과 같은 제목이면 id 유지, 모르는 행사 id 는 버림)", async () => {
    const callLlm = vi.fn().mockResolvedValue({
      candidates: [{ title: "현장체험학습 보조인력 배치 기준 확대", before: "학생 수 기준", after: "학급 단위로 확대 (추진)", status: "추진 중", eventIds: ["E-07", "E-99"], stepId: "safety_staff" }],
    });
    const r = await checkOfficialUpdates(changes, { demoMode: false, callLlm, now: NOW });
    expect(callLlm).toHaveBeenCalledOnce();
    expect(r.mode).toBe("llm");
    expect(r.found).toHaveLength(1);
    expect(r.found[0]).toMatchObject({ id: "C-03", eventIds: ["E-07"], guidelineId: "G-NAT-04" });
  });

  it("AI 응답이 틀리면 스냅샷 후보로 대체", async () => {
    const onError = vi.fn();
    const r = await checkOfficialUpdates(changes, { demoMode: false, callLlm: vi.fn().mockResolvedValue({ nope: 1 }), now: NOW, onError });
    expect(onError).toHaveBeenCalled();
    expect(r.found.map((c) => c.id)).toEqual(["C-03"]);
    expect(r.mode).toBe("snapshot");
  });

  it("데모 모드에서는 키가 있어도 AI를 부르지 않는다", async () => {
    const callLlm = vi.fn();
    await checkOfficialUpdates(changes, { demoMode: true, callLlm, now: NOW });
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("변경 알림에 추가한 뒤 화면 값", () => {
  it("changesWithAdded 가 합쳐진다 (중복 id 는 한 번)", async () => {
    const st = await withC03();
    expect(changesWithAdded(st).map((c) => c.id)).toEqual(["C-01", "C-02", "C-03"]);
    expect(changesWithAdded({ addedChanges: [changes[0]] }).length).toBe(2);
  });

  it("캘린더: E-07 안전요원 단계 마감일에 ⚠ (hasAlert)", async () => {
    const st = await withC03();
    const april = buildCalendar("2027-04", TODAY, st, events, changesWithAdded(st));
    const item = april.find((i) => i.eventId === "E-07" && i.stepId === "safety_staff")!;
    expect(item).toMatchObject({ date: "2027-04-12", hasAlert: true });
    // 추가 전에는 ⚠ 없음
    const before = buildCalendar("2027-04", TODAY).find((i) => i.eventId === "E-07" && i.stepId === "safety_staff")!;
    expect(before.hasAlert).toBe(false);
  });

  it("행사 카드 단계·대시보드 건수·인수인계 받기 ②에 반영", async () => {
    const st = await withC03();
    const all = changesWithAdded(st);
    const step = computeSchedule(getEvent("E-07")!, TODAY, st, undefined, all).find((s) => s.id === "safety_staff")!;
    expect(step.alertIds).toEqual(["C-03"]);
    expect(buildDashboard(TODAY, st, events, all).unconfirmedAlertCount).toBe(3);
    expect(buildHandoverBrief(TODAY, st, events, all).changes.map((c) => c.id)).toContain("C-03");
  });
});

describe("챗봇: 추가한 기준 변경 안내", () => {
  const ask = async (state: ClientState, demoMode = true, callLlm: never | null = null) =>
    answerQuestion({ question: "안전요원 몇 명 필요해?" }, { demoMode, today: TODAY, state, callLlm });

  it("데모 모드: C-03 을 추가했으면 안전요원 답 끝에 추진 중 안내", async () => {
    const r = await ask(await withC03());
    expect(r.answer).toContain("50명당"); // 기존 답은 그대로
    expect(r.answer).toContain(ADDED_SAFETY_NOTE);
    const plain = await ask(EMPTY_CLIENT_STATE);
    expect(plain.answer).not.toContain(ADDED_SAFETY_NOTE);
  });

  it("LLM 모드에도 덧붙는다", async () => {
    const st = await withC03();
    const callLlm = vi.fn().mockResolvedValue({ answer: "인천광역시교육청 기준 50명당 1명이에요.", sourceIds: ["G-INC-01"], notFound: false });
    const r = await answerQuestion({ question: "안전요원 몇 명 필요해?" }, { demoMode: false, today: TODAY, state: st, callLlm });
    expect(r.mode).toBe("llm");
    expect(r.answer).toContain(ADDED_SAFETY_NOTE);
  });

  it("다른 주제 질문에는 붙지 않는다", async () => {
    const r = await answerQuestion({ question: "동의율 몇 % 넘어야 해?" }, { demoMode: true, today: TODAY, state: await withC03(), callLlm: null });
    expect(r.answer).not.toContain(ADDED_SAFETY_NOTE);
  });
});
