// 배포 후 확인용: 서버가 살아 있는지, 데모 모드인지, 데이터에 오류가 없는지. API 키 값은 절대 내보내지 않는다.
import { NextResponse } from "next/server";
import { getModel, hasApiKey } from "@/lib/chat/llm";
import { changes, events, guidelines, templates } from "@/lib/data";
import { today } from "@/lib/dates";
import { isDemoMode } from "@/lib/env";
import { validateData } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const dataErrors = validateData({ events, templates, guidelines, changes });
  return NextResponse.json({
    ok: dataErrors.length === 0,
    today: today(),
    demoMode: isDemoMode(),
    apiKeyConfigured: hasApiKey(),
    model: getModel(),
    counts: { events: events.length, templates: templates.length, guidelines: guidelines.length, changes: changes.length },
    unverifiedGuidelines: guidelines.filter((g) => g.needsVerification).map((g) => g.id),
    dataErrors,
  });
}
