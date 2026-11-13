// 날짜는 전부 "YYYY-MM-DD" 문자열로 다루고, 계산은 UTC 로 해서 시간대 문제를 피합니다.
import type { DateString } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(s: unknown): s is DateString {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUtcMs(s: DateString): number {
  if (!isDateString(s)) throw new Error(`잘못된 날짜 형식: ${s} (YYYY-MM-DD 이어야 함)`);
  return Date.parse(`${s}T00:00:00Z`);
}

export function addDays(date: DateString, days: number): DateString {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** to - from (일). to 가 미래면 양수 */
export function diffDays(from: DateString, to: DateString): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 로컬(한국) 기준 오늘 날짜. NEXT_PUBLIC_DEMO_TODAY 가 있으면 그 날짜 */
export function today(): DateString {
  const demo = process.env.NEXT_PUBLIC_DEMO_TODAY;
  if (demo && isDateString(demo)) return demo;
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 해당 날짜가 속한 주의 월요일 */
export function startOfWeek(date: DateString): DateString {
  const dow = new Date(toUtcMs(date)).getUTCDay(); // 0=일
  const fromMonday = (dow + 6) % 7;
  return addDays(date, -fromMonday);
}

/** "D-62", "D-day", "D+3" */
export function formatDDay(daysLeft: number): string {
  if (daysLeft === 0) return "D-day";
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
}
