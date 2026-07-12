import { appendRow, ensureTab, readRange } from "./client";
import type { ScrapedPrice } from "../research/prices";
import type { NewsItem } from "../research/news";

export const TAB_MARKET = "시세조사";
export const TAB_NEWS = "뉴스";
export const TAB_BRIEF = "리서치브리핑";

const MARKET_HEADER = ["수집일시", "구분", "품목", "시세(원/kg)", "출처"];
const NEWS_HEADER = ["수집일", "제목", "출처", "링크"];
const BRIEF_HEADER = ["일시", "브리핑"];

/** 리서치용 탭들을 없으면 생성 */
export async function ensureResearchTabs(): Promise<void> {
  await ensureTab(TAB_MARKET, MARKET_HEADER);
  await ensureTab(TAB_NEWS, NEWS_HEADER);
  await ensureTab(TAB_BRIEF, BRIEF_HEADER);
}

/** 시세 스냅샷을 시세조사 탭에 추가 (매 수집마다 이력으로 쌓임 → 추세 분석 가능) */
export async function saveMarket(prices: ScrapedPrice[]): Promise<number> {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  for (const p of prices) {
    await appendRow(TAB_MARKET, [now, p.category, p.item, p.price, p.source]);
  }
  return prices.length;
}

/** 뉴스를 뉴스 탭에 추가하되 이미 있는 링크는 건너뛴다 (중복 방지) */
export async function saveNews(items: NewsItem[]): Promise<number> {
  const existing = await readRange(`${TAB_NEWS}!D2:D`);
  const seen = new Set(existing.map((r) => r[0]).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const it of items) {
    if (!it.link || seen.has(it.link)) continue;
    await appendRow(TAB_NEWS, [today, it.title, it.source, it.link]);
    seen.add(it.link);
    added++;
  }
  return added;
}

/** Claude 브리핑을 리서치브리핑 탭에 추가 */
export async function saveBrief(text: string): Promise<void> {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  await appendRow(TAB_BRIEF, [now, text]);
}

/** 시세조사 탭에서 읽어온 시장 시세 한 건 */
export interface MarketPrice {
  collectedAt: string; // 수집일시
  category: string; // 구분 (비철/고철 등)
  item: string; // 품목
  price: number; // 원/kg
  source: string; // 출처
}

/**
 * 시세조사 탭을 읽어 품목별 '최신' 스냅샷만 반환한다.
 * (탭은 매 수집마다 이력으로 쌓이므로 품목별로 수집일시가 가장 최근인 행만 남긴다.)
 */
export async function readMarket(): Promise<MarketPrice[]> {
  const rows = await readRange(`${TAB_MARKET}!A2:E`);
  const latest = new Map<string, MarketPrice>();
  for (const r of rows) {
    const item = (r[2] ?? "").trim();
    if (!item) continue;
    const rec: MarketPrice = {
      collectedAt: r[0] ?? "",
      category: (r[1] ?? "").trim(),
      item,
      price: Number(String(r[3] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
      source: (r[4] ?? "").trim(),
    };
    const prev = latest.get(item);
    if (!prev || rec.collectedAt >= prev.collectedAt) latest.set(item, rec);
  }
  return [...latest.values()];
}
