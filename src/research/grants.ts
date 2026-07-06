/**
 * grants.ts — 창업·중소기업 지원사업(공고) 다중 소스 크롤러
 *
 * 「모두의 창업」류 지원사업 공고를 여러 공식 소스에서 한 번에 긁어 표준 형태(Grant)로 모은다.
 * 소스별 함수로 분리했고 collectGrants()가 이를 합쳐 중복 제거 후 반환한다.
 *
 *  1) 기업마당(bizinfo) 오픈 API  — 정부·지자체·공공기관 지원사업 통합 (구조화 JSON, crtfcKey 필요)
 *  2) K-Startup 통합공고 API      — 창업지원포털 사업공고 (공공데이터포털 serviceKey 필요)
 *  3) 구글 뉴스 RSS               — 키 없이 동작하는 보강 소스 (공고 뉴스)
 *
 * API 키는 .env 로 주입하며, 없으면 해당 소스를 자동으로 건너뛰고
 * 키가 필요 없는 구글 뉴스 소스만으로도 동작한다(점진적 축소).
 */

export interface Grant {
  title: string; // 공고명
  org: string; // 소관/주관 기관
  field: string; // 지원분야
  target: string; // 지원대상
  startDate: string; // 접수 시작 (YYYY-MM-DD, 없으면 "")
  endDate: string; // 접수 마감 (YYYY-MM-DD, 없으면 "")
  region: string; // 지역
  source: string; // 출처 (기업마당 / K-Startup / 구글뉴스…)
  link: string; // 상세/원문 링크
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** 다양한 날짜 표기를 YYYY-MM-DD 로 정규화 (실패 시 원문 반환) */
function normDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = s.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s;
}

/** "20240101 ~ 20240131" 형태의 신청기간을 [시작, 마감] 으로 분해 */
function splitPeriod(raw: string | undefined | null): { start: string; end: string } {
  if (!raw) return { start: "", end: "" };
  const parts = String(raw).split("~").map((x) => x.trim());
  return { start: normDate(parts[0]), end: normDate(parts[1] ?? "") };
}

/** 1) 기업마당(bizinfo) 오픈 API — 정부·지자체·공공기관 지원사업 통합 */
export async function scrapeBizinfo(): Promise<Grant[]> {
  const key = process.env.BIZINFO_API_KEY ?? process.env.BIZINFO_CRTFC_KEY ?? "";
  if (!key) {
    console.log("[bizinfo] BIZINFO_API_KEY 미설정 — 건너뜀 (data.go.kr '기업마당 지원사업정보' 인증키)");
    return [];
  }
  const url =
    "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=" +
    encodeURIComponent(key) +
    "&dataType=json&searchCnt=100";
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`bizinfo API ${res.status}`);
  const data: any = await res.json();
  const rows: any[] = data?.jsonArray ?? data?.items ?? [];
  return rows
    .map((r: any): Grant => {
      const period = splitPeriod(r.reqstBeginEndDe);
      const rawUrl: string = r.pblancUrl ?? r.rceptEngnHmpgUrl ?? "";
      const link = rawUrl.startsWith("http") ? rawUrl : rawUrl ? `https://www.bizinfo.go.kr${rawUrl}` : "";
      return {
        title: String(r.pblancNm ?? "").trim(),
        org: String(r.jrsdInsttNm ?? r.excInsttNm ?? "").trim(),
        field: String(r.pldirSportRealmLclasCodeNm ?? "").trim(),
        target: String(r.trgetNm ?? "").replace(/<[^>]*>/g, "").trim(),
        startDate: period.start,
        endDate: period.end,
        region: "",
        source: "기업마당",
        link,
      };
    })
    .filter((g: Grant) => g.title);
}

/** 2) K-Startup 통합공고 API (공공데이터포털) — 창업지원포털 사업공고 */
export async function scrapeKStartup(): Promise<Grant[]> {
  const key = process.env.DATA_GO_KR_KEY ?? process.env.KSTARTUP_API_KEY ?? "";
  if (!key) {
    console.log("[k-startup] DATA_GO_KR_KEY 미설정 — 건너뜀 (data.go.kr 'K-Startup 사업공고' 서비스키)");
    return [];
  }
  const url =
    "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01" +
    "?serviceKey=" +
    encodeURIComponent(key) +
    "&numOfRows=100&pageNo=1&returnType=json";
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`k-startup API ${res.status}`);
  const data: any = await res.json();
  const rows: any[] = data?.data ?? data?.response?.body?.items?.item ?? [];
  return rows
    .map((r: any): Grant => ({
      title: String(r.biz_pbanc_nm ?? r.bizPbancNm ?? "").trim(),
      org: String(r.pbanc_ntrp_nm ?? r.pbancNtrpNm ?? "").trim(),
      field: String(r.supt_biz_clsfc ?? r.suptBizClsfc ?? "").trim(),
      target: String(r.aply_trgt ?? r.aplyTrgt ?? "").replace(/<[^>]*>/g, "").trim(),
      startDate: normDate(r.pbanc_rcpt_bgng_dt ?? r.pbancRcptBgngDt),
      endDate: normDate(r.pbanc_rcpt_end_dt ?? r.pbancRcptEndDt),
      region: String(r.supt_regin ?? r.suptRegin ?? "").trim(),
      source: "K-Startup",
      link: String(r.detl_pg_url ?? r.detlPgUrl ?? "https://www.k-startup.go.kr").trim(),
    }))
    .filter((g: Grant) => g.title);
}

// 구글 뉴스 보강 소스에 쓰는 공고성 검색 쿼리들
const NEWS_QUERIES = [
  "창업지원사업 모집공고",
  "예비창업 지원사업 공고",
  "중소기업 지원사업 모집",
  "소상공인 지원사업 공고",
  "자원순환 재활용 창업 지원",
  "창업경진대회 공모전 모집",
];

/** 3) 구글 뉴스 RSS — 키 없이 최근 2주 공고성 기사에서 지원사업을 보강 수집 */
export async function scrapeGrantNews(): Promise<Grant[]> {
  const out: Grant[] = [];
  for (const q of NEWS_QUERIES) {
    try {
      const url =
        "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=ko&gl=KR&ceid=KR:ko";
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const xml = await res.text();
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const block = m[1];
        const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
          .replace(/<!\[CDATA\[|\]\]>/g, "")
          .trim();
        const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
        const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
        if (!rawTitle) continue;
        const ageDays = pub ? (Date.now() - new Date(pub).getTime()) / 86400000 : 999;
        if (ageDays > 14) continue; // 최근 2주만
        if (!/(모집|접수|공고|신청|선정)/.test(rawTitle)) continue; // 공고성만
        if (/(마감|종료|결과발표|선정결과|수상|후기)/.test(rawTitle)) continue; // 지난 것 제외
        const dash = rawTitle.match(/^(.*) - ([^-]+)$/);
        out.push({
          title: (dash ? dash[1] : rawTitle).trim(),
          org: "",
          field: "",
          target: "",
          startDate: "",
          endDate: "",
          region: "",
          source: dash ? `구글뉴스·${dash[2].trim()}` : "구글뉴스",
          link,
        });
      }
    } catch (e) {
      console.log(`[news] 쿼리 실패 [${q}]: ${(e as Error).message}`);
    }
  }
  return out;
}

/** 제목 기준 안정 지문 (소스 간 중복 제거용) */
function grantKey(g: Grant): string {
  return g.title.replace(/\s+/g, "").replace(/[^가-힣0-9a-zA-Z]/g, "").slice(0, 50) || g.link;
}

/**
 * 모든 소스에서 지원사업 공고를 수집해 중복 제거 후 반환한다.
 * 한 소스가 실패해도 나머지는 그대로 반환한다(부분 실패 허용).
 */
export async function collectGrants(): Promise<Grant[]> {
  const results = await Promise.allSettled([scrapeBizinfo(), scrapeKStartup(), scrapeGrantNews()]);
  const all: Grant[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.log(`소스 수집 실패: ${(r.reason as Error)?.message ?? r.reason}`);
  }
  // 구조화 소스(기업마당·K-Startup)를 뉴스보다 우선해 dedup
  const priority = (s: string): number => (s.startsWith("구글뉴스") ? 0 : 1);
  const byKey = new Map<string, Grant>();
  for (const g of all) {
    const k = grantKey(g);
    const prev = byKey.get(k);
    if (!prev || priority(g.source) > priority(prev.source)) byKey.set(k, g);
  }
  return [...byKey.values()];
}
