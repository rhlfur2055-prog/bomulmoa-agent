/**
 * export-site-prices.ts — 구글시트 단가표 → site/prices.js 자동 생성 (사이트 단가 반영)
 * 실행: npm run export-prices   (시세/단가 바꾼 뒤 1회 실행 → 사이트 재배포)
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { getPrices } from "../sheets/prices";

async function main(): Promise<void> {
  const prices = await getPrices();
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const items = prices.map((p) => ({
    category: p.category || "기타",
    item: p.item,
    price: p.buyPrice || null,
    note: p.note ?? "",
  }));
  const body =
    "// 보물모아 매입 단가 — 이 파일은 `npm run export-prices` 로 구글시트 단가표에서 자동 생성됩니다.\n" +
    "// (수동으로 고쳐도 되지만, 다음 자동 생성 때 시트 내용으로 덮어써집니다)\n" +
    "window.BOMULMOA_PRICES = " +
    JSON.stringify({ updatedAt: now, unit: "원/kg", items }, null, 2) +
    ";\n";
  writeFileSync("site/prices.js", body);
  console.log(`site/prices.js 생성 완료 — ${items.length}개 품목 (${now} 기준)`);
}

main().catch((e) => {
  console.error("오류:", (e as Error).message);
  process.exit(1);
});
