// CORS: 프론트엔드(edu-AX/front-end, 다른 주소)가 이 백엔드의 /api/* 를 부를 수 있게 허용한다.
// 허용할 프론트 주소는 환경변수 ALLOWED_ORIGINS (쉼표로 여러 개). 비워 두면 로컬 개발 주소만 허용.
// Next.js 16 에서는 middleware 대신 proxy.ts 를 쓴다 (node_modules/next/dist/docs/.../proxy.md 의 CORS 예시).
import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

const corsOptions = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const isAllowed = allowedOrigins().includes(origin);

  // 사전 요청(preflight)
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: { ...(isAllowed && { "Access-Control-Allow-Origin": origin }), ...corsOptions },
    });
  }

  const response = NextResponse.next();
  if (isAllowed) response.headers.set("Access-Control-Allow-Origin", origin);
  for (const [k, v] of Object.entries(corsOptions)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
