/**
 * export-site-prices.ts — 구글시트 단가표 → site/prices.js 자동 생성 (사이트 단가 반영)
 * 실행: npm run export-prices   (시세/단가 바꾼 뒤 1회 실행 → 사이트 재배포)
 *
 * 단가표에 매입단가가 하나도 없으면 시세조사 탭(서버가 6시간마다 수집하는 시장 시세)으로
 * 자동 폴백한다. 둘 다 비어 있으면 기존 site/prices.js 를 덮어쓰지 않고 그대로 둔다.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { getPrices } from "../sheets/prices";
import { readMarket } from "../sheets/research";

interface SiteItem {
  category: string;
  item: string;
  price: number | null;
  note: string;
}

/** 현재 시각을 KST 기준 "YYYY-MM-DD HH:mm" 으로 반환 */
function nowKST(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date()).replace(",", "");
}

/** 단가표 우선, 비어 있으면 시세조사(시장 시세) 폴백. 둘 다 없으면 null */
async function buildItems(): Promise<{ source: string; items: SiteItem[] } | null> {
  const prices = await getPrices();
  if (prices.some((p) => p.buyPrice > 0)) {
    return {
      source: "단가표",
      items: prices.map((p) => ({
        category: p.category || "기타",
        item: p.item,
        price: p.buyPrice || null,
        note: p.note ?? "",
      })),
    };
  }
  const market = (await readMarket()).filter((m) => m.price > 0);
  if (market.length > 0) {
    return {
      source: "시세조사 폴백",
      items: market.map((m) => ({
        category: m.category || "기타",
        item: m.item,
        price: m.price,
        note: "",
      })),
    };
  }
  return null;
}

async function main(): Promise<void> {
  const built = await buildItems();
  if (!built) {
    console.log(
      "단가표·시세조사 모두 유효한 시세가 없음 — 기존 site/prices.js 를 유지합니다 (덮어쓰기 안 함)."
    );
    return;
  }
  const now = nowKST();
  const body =
    "// 보물모아 매입 단가 — 이 파일은 `npm run export-prices` 로 구글시트 단가표에서 자동 생성됩니다.\n" +
    "// (수동으로 고쳐도 되지만, 다음 자동 생성 때 시트 내용으로 덮어써집니다)\n" +
    "// 시장 참고 시세 기준 — 실제 매입가는 등급·상태·지역에 따라 상이합니다.\n" +
    "window.BOMULMOA_PRICES = " +
    JSON.stringify({ updatedAt: now, unit: "원/kg", items: built.items }, null, 2) +
    ";\n";
  writeFileSync("site/prices.js", body);
  console.log(
    `site/prices.js 생성 완료 — ${built.items.length}개 품목, 출처: ${built.source} (${now} KST 기준)`
  );
}

main().catch((e) => {
  console.error("오류:", (e as Error).message);
  process.exit(1);
});
