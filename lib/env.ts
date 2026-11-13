// 서버 환경변수 읽기
import "server-only";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE?.trim().toLowerCase() === "true";
}
