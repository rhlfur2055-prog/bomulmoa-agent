import { collectPrices } from "./prices";
import { fetchNews } from "./news";
import { makeBrief } from "./brief";
import { config } from "../config";
import { ensureResearchTabs, saveMarket, saveNews, saveBrief } from "../sheets/research";

/**
 * 리서치 에이전트 1회 실행:
 *  1) 고물상 시세 스크래핑 → 시세조사 탭
 *  2) 관련 뉴스 수집 → 뉴스 탭 (중복 제거)
 *  3) Claude 시황 브리핑 → 리서치브리핑 탭
 */
export async function runResearch(): Promise<void> {
  console.log("🔎 리서치 시작…");
  await ensureResearchTabs();

  const [prices, news] = await Promise.all([collectPrices(), fetchNews()]);
  console.log(`  · 시세 ${prices.length}건, 뉴스 ${news.length}건 수집`);

  const savedPrices = await saveMarket(prices);
  const addedNews = await saveNews(news);
  console.log(`  · 시트 기록: 시세 ${savedPrices}건, 새 뉴스 ${addedNews}건`);

  if (config.gemini.apiKey || config.anthropic.apiKey) {
    try {
      const brief = await makeBrief(prices, news);
      await saveBrief(brief);
      console.log("  · AI 브리핑 저장 완료:\n" + brief);
    } catch (e) {
      console.error("브리핑 생성 실패:", (e as Error).message);
    }
  } else {
    console.log("  · (GEMINI_API_KEY/ANTHROPIC_API_KEY 없음 → AI 브리핑 건너뜀)");
  }

  console.log("✅ 리서치 완료");
}

// 단독 실행: npm run research
if (require.main === module) {
  runResearch()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("❌ 리서치 오류:", e);
      process.exit(1);
    });
}
