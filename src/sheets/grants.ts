import { appendRow, ensureTab, readRange } from "./client";
import type { Grant } from "../research/grants";

export const TAB_GRANTS = "지원사업";

const GRANTS_HEADER = [
  "수집일",
  "제목",
  "지원기관",
  "분야",
  "지원대상",
  "접수시작",
  "접수마감",
  "지역",
  "출처",
  "링크",
];

/** 지원사업 탭이 없으면 생성 */
export async function ensureGrantsTab(): Promise<void> {
  await ensureTab(TAB_GRANTS, GRANTS_HEADER);
}

/** 수집한 지원사업을 지원사업 탭에 추가하되 이미 있는 공고(제목·링크)는 건너뛴다 */
export async function saveGrants(grants: Grant[]): Promise<number> {
  const existing = await readRange(`${TAB_GRANTS}!B2:J`); // B(제목)..J(링크)
  const seenTitle = new Set(existing.map((r) => (r[0] ?? "").replace(/\s+/g, "")).filter(Boolean));
  const seenLink = new Set(existing.map((r) => r[8]).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const g of grants) {
    const tkey = g.title.replace(/\s+/g, "");
    if ((g.link && seenLink.has(g.link)) || (tkey && seenTitle.has(tkey))) continue;
    await appendRow(TAB_GRANTS, [
      today,
      g.title,
      g.org,
      g.field,
      g.target,
      g.startDate,
      g.endDate,
      g.region,
      g.source,
      g.link,
    ]);
    seenTitle.add(tkey);
    if (g.link) seenLink.add(g.link);
    added++;
  }
  return added;
}

/** 시트에서 읽어온 지원사업 한 행 */
export interface GrantRow {
  collectedAt: string;
  title: string;
  org: string;
  field: string;
  target: string;
  startDate: string;
  endDate: string;
  region: string;
  source: string;
  link: string;
}

/** 지원사업 탭 전체를 읽어 구조화한다 (헤더 제외). 제목이 있는 행만 반환. */
export async function getGrants(): Promise<GrantRow[]> {
  const rows = await readRange(`${TAB_GRANTS}!A2:J`);
  return rows
    .filter((r) => r[1])
    .map((r) => ({
      collectedAt: r[0] ?? "",
      title: r[1] ?? "",
      org: r[2] ?? "",
      field: r[3] ?? "",
      target: r[4] ?? "",
      startDate: r[5] ?? "",
      endDate: r[6] ?? "",
      region: r[7] ?? "",
      source: r[8] ?? "",
      link: r[9] ?? "",
    }));
}
