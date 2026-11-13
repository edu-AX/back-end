// POST /api/updates/check — 공식 출처에서 기준 변경 후보를 찾는다 (지금은 시연용 스냅샷).
// AI는 후보만 만들고, 담당자가 화면에서 "변경 알림에 추가"해야 반영된다. 기준 값은 자동으로 바뀌지 않는다.
// CORS 는 proxy.ts 의 matcher("/api/:path*")가 이 경로에도 적용된다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, hasApiKey } from "@/lib/chat/llm";
import { changesWithAdded } from "@/lib/data";
import { isDemoMode } from "@/lib/env";
import { StateSchema, toClientState } from "@/lib/schemas";
import { checkOfficialUpdates } from "@/lib/updates/check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ state: StateSchema.optional() });

/** 데모 모드: 확인 중 애니메이션이 보이도록 일부러 조금 기다린다 */
const DEMO_DELAY_MS = 800;

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    const text = await req.text();
    body = Body.parse(text ? JSON.parse(text) : {});
  } catch {
    return NextResponse.json({ error: "요청 형식이 잘못됐어요" }, { status: 400 });
  }

  const demo = isDemoMode();
  const started = Date.now();
  const result = await checkOfficialUpdates(changesWithAdded(toClientState(body.state)), {
    demoMode: demo,
    callLlm: hasApiKey() ? generateJson : null,
    onError: (e) => console.error("[updates] 확인 중 오류(스냅샷으로 대체):", e instanceof Error ? e.message : e),
  });
  if (demo) {
    const wait = DEMO_DELAY_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  return NextResponse.json(result);
}
