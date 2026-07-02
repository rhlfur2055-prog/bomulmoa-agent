import Parser from "rss-parser";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  date: string; // ISO
}

const parser = new Parser();

// 고물상/재활용 사업 관련 검색 키워드 (OR 조합)
const QUERY = "고물상 OR 고철시세 OR 비철금속 OR 재활용 OR 자원순환";

/**
 * Google News RSS 로 고물상 관련 뉴스를 수집한다. (무료, 키 불필요)
 * @param limit 최대 개수
 */
export async function fetchNews(limit = 15): Promise<NewsItem[]> {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(QUERY) +
    "&hl=ko&gl=KR&ceid=KR:ko";

  const feed = await parser.parseURL(url);
  return (feed.items ?? []).slice(0, limit).map((it) => ({
    title: (it.title ?? "").trim(),
    link: it.link ?? "",
    // Google News 제목 끝에 " - 매체명" 형태가 붙는 경우가 많음
    source: (it.creator as string) ?? extractSource(it.title ?? ""),
    date: it.isoDate ?? new Date().toISOString(),
  }));
}

function extractSource(title: string): string {
  const m = title.match(/ - ([^-]+)$/);
  return m ? m[1].trim() : "";
}
