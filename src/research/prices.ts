import * as cheerio from "cheerio";

export interface ScrapedPrice {
  category: string; // 비철 / 고철 등
  item: string;
  price: number; // 원/kg
  source: string;
}

/** 문자열에서 원/kg 숫자만 추출 (예: "18,800원" → 18800) */
function parseKRW(s: string): number {
  const n = Number(String(s).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * gomulprice.com 시세 테이블을 스크래핑한다.
 * 사이트 구조가 바뀌면 SELECTORS 만 조정하면 됨.
 * 반환: 품목별 시세 배열
 */
export async function scrapeGomulPrice(): Promise<ScrapedPrice[]> {
  const url = "https://gomulprice.com/";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (BomulmoaBot research)" },
  });
  if (!res.ok) throw new Error(`시세 페이지 요청 실패: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const out: ScrapedPrice[] = [];
  // 모든 테이블 행을 훑어 [품목명, 가격(원/kg)] 패턴을 추출한다.
  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("th,td")
      .map((__, td) => $(td).text().trim())
      .get();
    if (cells.length < 2) return;

    // 가격 셀: '원' 또는 콤마가 있고 값이 10~999,999 범위 (8자리 기준일 20260701 은 자동 제외)
    let priceIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (!/[,원]/.test(cells[i])) continue;
      const n = parseKRW(cells[i]);
      if (n >= 10 && n <= 999999) {
        priceIdx = i;
        break;
      }
    }
    if (priceIdx <= 0) return;
    const price = parseKRW(cells[priceIdx]);

    // 품목명: 가격 셀 바로 앞의 한글 포함 셀
    const item = cells[priceIdx - 1];
    if (!item || !/[가-힣]/.test(item) || item.length > 20) return;

    // 분류: 첫 셀이 비철/고철이면 사용, 아니면 품목명으로 추정
    const first = cells[0];
    const cat = /비철/.test(first)
      ? "비철"
      : /고철|철/.test(first)
        ? "고철"
        : /생철|중량|경량|고철/.test(item)
          ? "고철"
          : "비철";
    out.push({ category: cat, item, price, source: "gomulprice.com" });
  });

  return out;
}

/**
 * 여러 소스를 합쳐 시세를 수집한다 (현재는 gomulprice 하나, 추후 소스 추가 지점).
 * directscrap.co.kr, komis 등을 여기에 함수로 추가하면 됨.
 */
export async function collectPrices(): Promise<ScrapedPrice[]> {
  const results: ScrapedPrice[] = [];
  try {
    results.push(...(await scrapeGomulPrice()));
  } catch (e) {
    console.error("gomulprice 스크래핑 실패:", (e as Error).message);
  }
  return results;
}
