import { config } from "../config";
import { appendRow, readRange } from "./client";

const TAB = config.google.tabs.worklog;
export const WORKLOG_HEADER = ["날짜", "팀원", "역할", "작업내용", "소요시간(h)"];

export interface WorkLogInput {
  member: string;
  role: string;
  description: string;
  hours: number;
}

/** 작업 로그 1건 기록 */
export async function logWork(input: WorkLogInput): Promise<{ date: string }> {
  const date = new Date().toISOString().slice(0, 10);
  await appendRow(TAB, [date, input.member, input.role, input.description, input.hours]);
  return { date };
}

export interface DaySummaryRow {
  member: string;
  role: string;
  hours: number;
  tasks: number;
}

/** 특정 날짜(기본 오늘)의 팀원별 작업량 집계 */
export async function getDaySummary(date?: string): Promise<DaySummaryRow[]> {
  const day = date ?? new Date().toISOString().slice(0, 10);
  const rows = await readRange(`${TAB}!A2:E`);
  const todays = rows.filter((r) => (r[0] ?? "").startsWith(day));
  const map = new Map<string, DaySummaryRow>();
  for (const r of todays) {
    const member = r[1] ?? "미상";
    const role = r[2] ?? "";
    const hours = Number(r[4]) || 0;
    const cur = map.get(member) ?? { member, role, hours: 0, tasks: 0 };
    cur.hours += hours;
    cur.tasks += 1;
    if (!cur.role && role) cur.role = role;
    map.set(member, cur);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}
