import { config } from "../config";
import { readRange, writeRange } from "./client";

const TAB = config.google.tabs.prices;

export interface PriceRow {
  rowIndex: number; // 시트 실제 행 번호 (1-based, 헤더 제외 시 2부터)
  item: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  note: string;
}

/** 단가표 전체를 읽어 구조화한다. 헤더: 품목, 분류, 매입단가, 판매단가, ..., 비고 */
export async function getPrices(): Promise<PriceRow[]> {
  const rows = await readRange(`${TAB}!A2:F`);
  return rows
    .filter((r) => r[0])
    .map((r, i) => ({
      rowIndex: i + 2,
      item: r[0] ?? "",
      category: r[1] ?? "",
      buyPrice: Number(String(r[2] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
      sellPrice: Number(String(r[3] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
      note: r[5] ?? "",
    }));
}

/** 품목명(부분일치 허용)으로 단가를 조회한다 */
export async function findPrice(item: string): Promise<PriceRow | undefined> {
  const prices = await getPrices();
  const q = item.trim();
  return prices.find((p) => p.item === q) ?? prices.find((p) => p.item.includes(q));
}

/** 품목의 매입/판매 단가를 수정한다. 반환: 변경 전 값 (알림용) */
export async function updatePrice(
  item: string,
  buyPrice?: number,
  sellPrice?: number
): Promise<{ before: PriceRow; after: PriceRow } | null> {
  const target = await findPrice(item);
  if (!target) return null;
  const before = { ...target };
  const newBuy = buyPrice ?? target.buyPrice;
  const newSell = sellPrice ?? target.sellPrice;
  // C열=매입단가, D열=판매단가
  await writeRange(`${TAB}!C${target.rowIndex}:D${target.rowIndex}`, [[newBuy, newSell]]);
  return { before, after: { ...target, buyPrice: newBuy, sellPrice: newSell } };
}
