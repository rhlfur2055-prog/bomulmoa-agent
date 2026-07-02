import { config } from "../config";
import { appendRow, readRange } from "./client";
import { findPrice } from "./prices";

const TAB = config.google.tabs.intake;
export const INTAKE_HEADER = ["날짜", "담당자", "고객", "품목", "무게(kg)", "매입단가", "지급액", "비고"];

export interface IntakeInput {
  handler: string; // 담당 팀원 이름
  customer: string;
  item: string;
  weightKg: number;
  note?: string;
}

/** 매입 기록 1건을 추가한다. 단가표에서 매입단가를 조회해 지급액을 자동 계산 */
export async function addIntake(input: IntakeInput): Promise<{
  amount: number;
  unitPrice: number;
  date: string;
}> {
  const price = await findPrice(input.item);
  const unitPrice = price?.buyPrice ?? 0;
  const amount = Math.round(unitPrice * input.weightKg);
  const date = new Date().toISOString().slice(0, 10);
  await appendRow(TAB, [
    date,
    input.handler,
    input.customer,
    input.item,
    input.weightKg,
    unitPrice,
    amount,
    input.note ?? "",
  ]);
  return { amount, unitPrice, date };
}

/** 오늘 매입 내역 요약 (건수, 총 지급액) */
export async function getTodayIntake(): Promise<{ count: number; total: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await readRange(`${TAB}!A2:G`);
  const todays = rows.filter((r) => (r[0] ?? "").startsWith(today));
  const total = todays.reduce((sum, r) => sum + (Number(r[6]) || 0), 0);
  return { count: todays.length, total };
}
