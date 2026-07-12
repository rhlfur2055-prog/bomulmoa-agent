/**
 * export-site-posts.ts — 구글시트 리서치 데이터 → site/posts/ 자동 포스트 생성
 * 실행: npm run export-posts             → 오늘의 시세 브리핑 포스트 (시세 데이터 없으면 건너뜀)
 *       npm run export-posts -- --grants → 주간 지원사업 모음 포스트도 생성 (월요일에는 자동)
 *       npm run export-posts -- --sample → 샘플 데이터로 포스트 1건 생성 (시트/환경변수 불필요)
 *       npm run export-posts -- --dry    → 파일을 쓰지 않고 결과만 출력
 *
 * 생성물: site/posts/<slug>.html (정적 포스트 페이지)
 *         site/posts.js          (포스트 목록 매니페스트 — 홈 화면 노출용)
 *         site/posts/index.html  (전체 글 아카이브 페이지)
 *         site/sitemap.xml       (홈·정기수거·지역·품목·포스트 전체 사이트맵)
 * 같은 날 다시 실행하면 그날 포스트를 제자리에서 갱신합니다 (멱등).
 */
import "dotenv/config";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { MarketPrice } from "../sheets/research";
import type { GrantRow } from "../sheets/grants";

const SITE_DIR = "site";
const POSTS_DIR = join(SITE_DIR, "posts");
const MANIFEST_PATH = join(SITE_DIR, "posts.js");
const BASE_URL = "https://bomulmoa.com";
const MAX_POSTS = 100; // 매니페스트에 보관할 최대 포스트 수

/** 매니페스트(site/posts.js)에 실리는 포스트 한 건의 메타 */
interface PostMeta {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: "sise" | "grants";
  summary: string;
}

/** 생성할 포스트 (메타 + 본문 HTML) */
interface Post extends PostMeta {
  bodyHtml: string;
}

/** 뉴스 탭에서 읽어온 한 건 */
interface NewsRow {
  date: string;
  title: string;
  source: string;
  link: string;
}

const TYPE_LABEL: Record<PostMeta["type"], string> = {
  sise: "시세 브리핑",
  grants: "지원사업",
};

/* ── 유틸 ─────────────────────────────────────────── */

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string;
  });
}

function won(n: number): string {
  return n > 0 ? `${n.toLocaleString("ko-KR")}원` : "전화 문의";
}

/** KST(Asia/Seoul) 기준 YYYY-MM-DD — 서버 시간대/UTC 와 무관하게 한국 날짜를 쓴다 */
function kstDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

/** KST 기준 월요일 여부 (주간 지원사업 포스트 자동 생성 판정용) */
function isKstMonday(d = new Date()): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(d) ===
    "Mon"
  );
}

/** 인라인 <script> 삽입용 JSON 이스케이프 — </script> 이탈·유니코드 줄구분자 깨짐 방지 */
function safeJsonForHtml(obj: unknown, space?: number): string {
  return JSON.stringify(obj, null, space)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/* ── HTML 템플릿 ─────────────────────────────────── */

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='46' fill='%23c4703a'/%3E%3Ctext x='50' y='67' font-size='50' text-anchor='middle' fill='%23fff' font-family='sans-serif' font-weight='bold'%3E%EB%B3%B4%3C/text%3E%3C/svg%3E";

/** 포스트/아카이브 공용 페이지 골격 */
function pageShell(opts: {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  jsonLd?: object;
  main: string;
}): string {
  const jsonLd = opts.jsonLd
    ? `<script type="application/ld+json">${safeJsonForHtml(opts.jsonLd)}</script>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(opts.title)} | 보물모아</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
<meta property="og:type" content="${esc(opts.ogType)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(opts.title)} | 보물모아">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:site_name" content="보물모아">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="../style.css">
${jsonLd}</head>
<body class="post-page">

<header class="site-header">
  <div class="container">
    <a class="logo" href="../">보물<em>모아</em></a>
    <a class="header-call" href="../#locations">📞 전화</a>
  </div>
</header>

<main class="container post-main">
${opts.main}
</main>

<footer>
  <div class="container">
    <div><strong>보물모아</strong> · 고철·비철·폐지 매입</div>
    <div>© 보물모아</div>
  </div>
</footer>
</body>
</html>
`;
}

/** 포스트 하단 고정 전화 CTA 박스 (정적) */
function ctaBox(): string {
  return `  <div class="post-cta">
    <strong>고철·비철·폐지, 오늘 단가로 매입합니다</strong>
    <p>소량 환영 · 방문수거 · 현장 계근 즉시 정산 — 전화 한 통이면 됩니다.</p>
    <div class="post-cta-actions">
      <a class="btn btn-primary" href="../#locations">📞 지점 전화 안내</a>
      <a class="btn btn-outline" href="../#prices">오늘 매입 단가 보기</a>
    </div>
  </div>`;
}

/** 포스트 한 건의 정적 페이지 HTML */
function renderPostPage(post: Post): string {
  const canonical = `${BASE_URL}/posts/${post.slug}.html`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: "ko",
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: "보물모아" },
    publisher: { "@type": "Organization", name: "보물모아" },
  };
  const main = `  <article class="post-article">
    <p class="post-meta"><span class="badge">${esc(TYPE_LABEL[post.type])}</span> ${esc(post.date)}</p>
    <h1 class="post-title">${esc(post.title)}</h1>
${post.bodyHtml}
  </article>
${ctaBox()}
  <p class="post-back"><a href="index.html">← 전체 글 보기</a></p>`;
  return pageShell({
    title: post.title,
    description: post.summary,
    canonical,
    ogType: "article",
    jsonLd,
    main,
  });
}

/** 아카이브(전체 글 목록) 페이지 HTML — 매니페스트에서 재생성 */
function renderArchivePage(posts: PostMeta[]): string {
  const items = posts
    .map(
      (p) => `      <a class="post-item" href="${esc(p.slug)}.html">
        <span class="post-item-meta">${esc(p.date)} · ${esc(TYPE_LABEL[p.type] ?? p.type)}</span>
        <span class="post-item-title">${esc(p.title)}</span>
        <span class="post-item-summary">${esc(p.summary)}</span>
      </a>`
    )
    .join("\n");
  const main = `  <div class="sec-head">
    <h2 class="sec-title">📰 소식·시세 브리핑</h2>
    <p class="sec-sub">고철·비철 시세와 창업·중소기업 지원사업 소식을 정리합니다</p>
  </div>
  ${posts.length ? `<div class="post-list">\n${items}\n    </div>` : `<p class="post-empty">아직 등록된 글이 없습니다.</p>`}
${ctaBox()}`;
  return pageShell({
    title: "소식·시세 브리핑",
    description: "보물모아가 매일 정리하는 고철·비철 시세 브리핑과 창업·중소기업 지원사업 소식 모음.",
    canonical: `${BASE_URL}/posts/index.html`,
    ogType: "website",
    main,
  });
}

/* ── 매니페스트 (site/posts.js) ───────────────────── */

/** 기존 매니페스트를 파싱한다 (없거나 깨졌으면 빈 목록) */
function loadManifest(): PostMeta[] {
  if (!existsSync(MANIFEST_PATH)) return [];
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    const m = raw.match(/window\.BOMULMOA_POSTS\s*=\s*(\{[\s\S]*\})\s*;/);
    if (!m) return [];
    const data = JSON.parse(m[1]) as { posts?: PostMeta[] };
    return Array.isArray(data.posts) ? data.posts.filter((p) => p && p.slug) : [];
  } catch {
    return [];
  }
}

/** 새 포스트를 병합한다 — slug 로 중복 제거, 최신순 정렬, 최대 MAX_POSTS 건 */
function mergeManifest(existing: PostMeta[], fresh: PostMeta[]): PostMeta[] {
  const freshSlugs = new Set(fresh.map((p) => p.slug));
  const merged = [...fresh, ...existing.filter((p) => !freshSlugs.has(p.slug))];
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return merged.slice(0, MAX_POSTS);
}

function renderManifest(posts: PostMeta[]): string {
  return (
    "// 보물모아 소식·브리핑 목록 — 이 파일은 `npm run export-posts` 로 자동 생성됩니다.\n" +
    "// (수동으로 고쳐도 되지만, 다음 자동 생성 때 덮어써집니다)\n" +
    "window.BOMULMOA_POSTS = " +
    safeJsonForHtml({ posts }, 2) +
    ";\n"
  );
}

/* ── 사이트맵 (site/sitemap.xml) ──────────────────── */

const SITEMAP_PATH = join(SITE_DIR, "sitemap.xml");

/** site/<dir>/ 안의 .html 파일명 목록 — 디렉터리가 없으면 빈 목록 */
function listSiteHtml(dir: string): string[] {
  try {
    return readdirSync(join(SITE_DIR, dir))
      .filter((f) => f.endsWith(".html"))
      .sort();
  } catch {
    return [];
  }
}

/** 홈·정기수거·지역·품목 페이지 + 포스트(샘플 제외)를 담은 sitemap.xml 본문 */
function renderSitemap(posts: PostMeta[]): string {
  const lastmod = kstDate();
  const urls: string[] = [`${BASE_URL}/`];
  if (existsSync(join(SITE_DIR, "pickup.html"))) urls.push(`${BASE_URL}/pickup.html`);
  for (const f of listSiteHtml("region")) urls.push(`${BASE_URL}/region/${f}`);
  for (const f of listSiteHtml("items")) urls.push(`${BASE_URL}/items/${f}`);
  urls.push(`${BASE_URL}/posts/index.html`);
  for (const p of posts) {
    if (!p.slug.startsWith("sample-")) urls.push(`${BASE_URL}/posts/${p.slug}.html`);
  }
  const body = urls
    .map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function writeSitemap(posts: PostMeta[]): void {
  writeFileSync(SITEMAP_PATH, renderSitemap(posts));
  console.log(`${SITEMAP_PATH} 갱신 완료`);
}

/* ── 포스트 빌더 ─────────────────────────────────── */

/** 일간 시세 브리핑 포스트 */
function buildSisePost(opts: {
  date: string;
  slug?: string;
  titleSuffix?: string;
  market: MarketPrice[];
  brief: string;
  news: NewsRow[];
}): Post {
  const { date, market, brief, news } = opts;
  // 구분(카테고리) → 품목 순으로 정렬해 표를 만든다
  const sorted = [...market].sort(
    (a, b) => a.category.localeCompare(b.category, "ko") || a.item.localeCompare(b.item, "ko")
  );
  const rows = sorted
    .map(
      (p) => `        <tr>
          <td class="col-item">${esc(p.item)}${p.category ? ` <span class="post-cat">${esc(p.category)}</span>` : ""}</td>
          <td class="col-price">${esc(won(p.price))}</td>
          <td class="col-note">${esc(p.source)}</td>
        </tr>`
    )
    .join("\n");

  const briefHtml = brief.trim()
    ? `    <h2>AI 시세 브리핑</h2>\n` +
      brief
        .trim()
        .split(/\n+/)
        .map((line) => `    <p>${esc(line.trim())}</p>`)
        .join("\n") +
      "\n"
    : "";

  const newsHtml = news.length
    ? `    <h2>관련 뉴스</h2>\n    <ul class="post-news">\n` +
      news
        .map(
          (n) =>
            `      <li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` +
            `${n.source ? ` <span class="post-news-src">— ${esc(n.source)}${n.date ? `, ${esc(n.date)}` : ""}</span>` : ""}</li>`
        )
        .join("\n") +
      "\n    </ul>\n"
    : "";

  const top = sorted.filter((p) => p.price > 0).sort((a, b) => b.price - a.price)[0];
  const summary =
    `${date} 기준 고철·비철 ${sorted.length}개 품목 시세 스냅샷` +
    (top ? ` — ${top.item} ${won(top.price)}/kg` : "") +
    (news.length ? ` · 업계 뉴스 ${news.length}건` : "") +
    ".";

  const bodyHtml =
    `    <p>보물모아가 ${esc(date)} 기준으로 정리한 고철·비철 품목별 최신 시세입니다. ` +
    `아래 시세는 시장 조사 자료이며, 실제 매입 단가는 <a href="../#prices">오늘의 매입 단가</a>를 확인해 주세요.</p>
    <table class="price-table post-table">
      <thead>
        <tr><th class="col-item">품목</th><th class="col-price">시세 (원/kg)</th><th class="col-note">출처</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
${briefHtml}${newsHtml}`;

  return {
    slug: opts.slug ?? `sise-${date}`,
    title: `오늘의 고철·비철 시세 브리핑 (${opts.titleSuffix ?? date})`,
    date,
    type: "sise",
    summary,
    bodyHtml,
  };
}

/** 접수마감(YYYY-MM-DD 형태로 정규화)을 뽑는다 — 못 읽으면 null (상시 등) */
function parseDeadline(endDate: string): string | null {
  const m = (endDate ?? "").match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 주간 지원사업 모음 포스트 */
function buildGrantsPost(date: string, grants: GrantRow[]): Post {
  // 마감 임박 순 정렬 (마감일을 못 읽는 상시 공고는 뒤로)
  const sorted = [...grants].sort((a, b) => {
    const da = parseDeadline(a.endDate);
    const db = parseDeadline(b.endDate);
    if (da && db) return da < db ? -1 : da > db ? 1 : 0;
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
  const rows = sorted
    .map((g) => {
      const title = g.link
        ? `<a href="${esc(g.link)}" target="_blank" rel="noopener">${esc(g.title)}</a>`
        : esc(g.title);
      return `        <tr>
          <td class="col-item">${title}${g.org ? `<span class="post-cat">${esc(g.org)}</span>` : ""}</td>
          <td class="col-price">${esc(g.endDate || "상시")}</td>
          <td class="col-note">${esc([g.region, g.target].filter(Boolean).join(" · "))}</td>
        </tr>`;
    })
    .join("\n");

  const bodyHtml =
    `    <p>${esc(date)} 기준으로 모집 중인 창업·중소기업 지원사업 ${sorted.length}건을 마감 임박 순으로 정리했습니다. ` +
    `제목을 누르면 공고 원문으로 이동합니다.</p>
    <table class="price-table post-table">
      <thead>
        <tr><th class="col-item">공고</th><th class="col-price">접수마감</th><th class="col-note">지역 · 대상</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <p class="post-note">※ 마감일·지원 요건은 변동될 수 있으니 반드시 공고 원문에서 확인하세요.</p>`;

  const first = sorted[0];
  const summary =
    `모집 중인 창업·중소기업 지원사업 ${sorted.length}건 정리` +
    (first?.endDate ? ` — 가장 빠른 마감 ${first.endDate}` : "") +
    ".";

  return {
    slug: `grants-${date}`,
    title: "이번 주 창업·중소기업 지원사업 모음",
    date,
    type: "grants",
    summary,
    bodyHtml,
  };
}

/* ── 샘플 데이터 (--sample: 시트/환경변수 없이 동작) ── */

const SAMPLE_DATE = "2026-07-12";

const SAMPLE_MARKET: MarketPrice[] = [
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "비철", item: "구리 (A동)", price: 11850, source: "국내 스크랩 시세" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "비철", item: "구리 (파동)", price: 10900, source: "국내 스크랩 시세" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "비철", item: "황동", price: 8200, source: "국내 스크랩 시세" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "비철", item: "알루미늄 샷시", price: 2750, source: "국내 스크랩 시세" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "비철", item: "스테인리스 (304)", price: 2300, source: "국내 스크랩 시세" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "고철", item: "중량고철", price: 415, source: "제강사 고시가" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "고철", item: "경량고철", price: 355, source: "제강사 고시가" },
  { collectedAt: `${SAMPLE_DATE} 07:00`, category: "폐지", item: "폐골판지", price: 105, source: "제지사 고시가" },
];

const SAMPLE_BRIEF = [
  "구리는 LME 재고 감소와 환율 영향으로 전주 대비 소폭 상승했습니다. A동 기준 kg당 11,800원대가 유지되고 있어 비철 반입이 늘어나는 시점입니다.",
  "고철은 제강사 감산 기조로 보합세입니다. 중량고철 415원/kg 수준에서 큰 변동은 없을 것으로 보이며, 폐지는 수출 물량 감소로 약보합입니다.",
].join("\n");

const SAMPLE_NEWS: NewsRow[] = [
  { date: SAMPLE_DATE, title: "구리값 강세 지속… LME 재고 3개월 만에 최저", source: "철강금속신문", link: "https://www.snmnews.com/news/sample-1" },
  { date: SAMPLE_DATE, title: "제강사 철스크랩 구매가 동결… 계절적 비수기 진입", source: "스틸데일리", link: "https://www.steeldaily.co.kr/news/sample-2" },
  { date: SAMPLE_DATE, title: "폐지 수출 감소에 국내 압축상 재고 부담 커져", source: "자원순환신문", link: "https://www.recycling-news.co.kr/news/sample-3" },
];

/* ── 메인 ─────────────────────────────────────────── */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const sample = args.includes("--sample");
  const withGrants = args.includes("--grants") || isKstMonday(); // 월요일(KST) 자동

  const fresh: Post[] = [];

  if (sample) {
    // 샘플 모드 — 시트/환경변수 없이 내장 데이터로 1건 생성
    fresh.push(
      buildSisePost({
        date: SAMPLE_DATE,
        slug: "sample-sise-brief",
        titleSuffix: "샘플",
        market: SAMPLE_MARKET,
        brief: SAMPLE_BRIEF,
        news: SAMPLE_NEWS,
      })
    );
  } else if (!process.env.GOOGLE_SHEET_ID) {
    // 인증정보 없이 실행(--dry 포함)해도 실패가 아니라 건너뛰기 — exit 0
    console.log(
      "환경변수 GOOGLE_SHEET_ID 가 없어 시트 기반 글 생성을 건너뜁니다 (.env 설정 또는 --sample 사용)."
    );
  } else {
    // 시트 접근이 필요할 때만 동적 로드 (--sample 이 GOOGLE_SHEET_ID 없이도 돌도록)
    const { readMarket, TAB_BRIEF, TAB_NEWS } = await import("../sheets/research");
    const { readRange } = await import("../sheets/client");
    const date = kstDate();

    const market = await readMarket();
    if (market.length === 0) {
      console.log("시세조사 탭에 데이터가 없어 오늘의 시세 브리핑을 건너뜁니다.");
    } else {
      const briefRows = await readRange(`${TAB_BRIEF}!A2:B`);
      const lastBrief = briefRows.length ? (briefRows[briefRows.length - 1][1] ?? "") : "";
      const newsRows = await readRange(`${TAB_NEWS}!A2:D`);
      const news: NewsRow[] = newsRows
        .filter((r) => r[1] && r[3])
        .slice(-5)
        .reverse()
        .map((r) => ({ date: r[0] ?? "", title: r[1] ?? "", source: r[2] ?? "", link: r[3] ?? "" }));
      fresh.push(buildSisePost({ date, market, brief: lastBrief, news }));
    }

    if (withGrants) {
      const { getGrants } = await import("../sheets/grants");
      const all = await getGrants();
      const open = all.filter((g) => {
        const d = parseDeadline(g.endDate);
        return !d || d >= date; // 마감일 없으면(상시) 모집 중으로 간주
      });
      if (open.length === 0) {
        console.log("모집 중인 지원사업이 없어 주간 모음 포스트를 건너뜁니다.");
      } else {
        fresh.push(buildGrantsPost(date, open));
      }
    }
  }

  // 실서비스 모드(--sample 아님)에서는 샘플 글(sample-*)을 매니페스트에서 걷어낸다
  // — 배포 시 sample-*.html 은 제외되므로 목록에 남아 있으면 404 링크가 된다
  const existing = loadManifest();
  const kept = sample ? existing : existing.filter((p) => !p.slug.startsWith("sample-"));
  const removedSample = kept.length !== existing.length;

  if (fresh.length === 0 && !removedSample) {
    console.log("생성할 포스트가 없습니다.");
    if (!dry) writeSitemap(kept); // 새 글이 없어도 사이트맵은 최신 페이지 목록으로 갱신
    return;
  }
  if (removedSample) {
    console.log("매니페스트에서 샘플 글(sample-*)을 제거합니다.");
  }

  const manifest = mergeManifest(kept, fresh.map(({ bodyHtml: _b, ...meta }) => meta));

  if (dry) {
    for (const p of fresh) {
      console.log(`--- ${POSTS_DIR}/${p.slug}.html ---`);
      console.log(renderPostPage(p));
    }
    console.log(`--- ${MANIFEST_PATH} ---`);
    console.log(renderManifest(manifest));
    console.log(`--- ${SITEMAP_PATH} ---`);
    console.log(renderSitemap(manifest));
    console.log(`(--dry: 파일을 쓰지 않았습니다 — 포스트 ${fresh.length}건, 매니페스트 ${manifest.length}건)`);
    return;
  }

  mkdirSync(POSTS_DIR, { recursive: true });
  for (const p of fresh) {
    writeFileSync(join(POSTS_DIR, `${p.slug}.html`), renderPostPage(p));
    console.log(`${POSTS_DIR}/${p.slug}.html 생성 완료 — ${p.title}`);
  }
  writeFileSync(MANIFEST_PATH, renderManifest(manifest));
  writeFileSync(join(POSTS_DIR, "index.html"), renderArchivePage(manifest));
  console.log(`${MANIFEST_PATH} · ${POSTS_DIR}/index.html 갱신 완료 — 총 ${manifest.length}건`);
  writeSitemap(manifest);
}

main().catch((e) => {
  console.error("오류:", (e as Error).message);
  process.exit(1);
});
