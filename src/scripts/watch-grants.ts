/**
 * watch-grants.ts — 예비창업자 대상 지원사업·공모전 신규 공고 감시망
 *
 * 구글 뉴스 RSS를 여러 쿼리로 훑어 "모집/접수/공고" 신호가 있는 최근 기사만 골라내고,
 * 관련도 점수(예비창업·공공데이터·지역·재활용/자원순환 가점 - 부적격 감점)로 필터한 뒤
 * 이전에 알린 적 없는 새 공고만 Slack #보물모아-전체 채널로 요약 알림한다.
 *
 * - 무료(구글 뉴스 RSS), 키 불필요
 * - 상태 파일(.grants-state.json)에 이미 알린 링크 지문을 최근 300개 저장 → 중복 방지
 * - 서버 cron에서 하루 1회(아침) 실행 권장
 * 실행: npx tsx src/scripts/watch-grants.ts   (--dry 로 알림 없이 미리보기)
 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { readFileSync, writeFileSync } from "fs";

const CHANNEL =
  process.env.SLACK_NOTIFY_CHANNEL && process.env.SLACK_NOTIFY_CHANNEL.startsWith("C")
    ? process.env.SLACK_NOTIFY_CHANNEL
    : "C0BEHD6S7MX"; // #보물모아-전체
const STATE_FILE = ".grants-state.json";
const DRY = process.argv.includes("--dry");

const MAX_AGE_DAYS = 5; // 이 일수 이내 기사만
const MAX_ALERTS = 8; // 1회 알림 최대 건수 (스팸 방지)
const SEEN_KEEP = 300; // 상태 파일에 유지할 지문 개수

// 검색 쿼리들 — 넓게 긁고 점수로 거른다
const QUERIES = [
  "예비창업 모집공고",
  "예비창업자 모집",
  "창업지원사업 모집공고",
  "창업경진대회 접수",
  "공공데이터 활용 창업",
  "자원순환 재활용 창업 지원",
  "인천 창업지원 모집",
  "경기 창업지원 모집",
];

// 관련도 가점 / 감점 키워드
const POS = [
  { re: /예비창업/, w: 5 },
  { re: /공공데이터|데이터.?활용|AI.?활용/, w: 4 },
  { re: /자원순환|재활용|폐기물|친환경|에코|탄소중립/, w: 4 },
  { re: /경진대회|공모전|아이디어/, w: 2 },
  { re: /인천|부천|경기|수도권/, w: 3 },
  { re: /모집|접수|공고|신청/, w: 1 },
];
const NEG = [
  { re: /여성|청소년|중학생|고등학생|대학생|장병|군인|해군|육군|공군/, w: 6 }, // 자격 제한
  { re: /마감|종료|결과발표|선정결과|수상|후기/, w: 5 },
  { re: /해외|글로벌.?진출|수출/, w: 2 },
];

interface Item {
  title: string;
  link: string;
  source: string;
  date: string;
  score: number;
}
interface State {
  seen: string[];
  lastRun: string;
}

function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return { seen: [], lastRun: "" };
  }
}

/** 링크에서 안정적인 지문 추출 (구글뉴스 리다이렉트 URL 대응) */
function fingerprint(link: string, title: string): string {
  const t = title.replace(/\s+/g, "").replace(/[^가-힣0-9a-zA-Z]/g, "").slice(0, 40);
  return t || link.slice(0, 60);
}

function stripSource(title: string): { title: string; source: string } {
  const m = title.match(/^(.*) - ([^-]+)$/);
  if (m) return { title: m[1].trim(), source: m[2].trim() };
  return { title, source: "" };
}

function scoreOf(text: string): number {
  let s = 0;
  for (const { re, w } of POS) if (re.test(text)) s += w;
  for (const { re, w } of NEG) if (re.test(text)) s -= w;
  return s;
}

async function fetchQuery(q: string): Promise<Item[]> {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(q) +
    "&hl=ko&gl=KR&ceid=KR:ko";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];
  const xml = await res.text();
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const pub = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
    if (!rawTitle) continue;
    const ageDays = pub ? (Date.now() - new Date(pub).getTime()) / 86400000 : 999;
    if (ageDays > MAX_AGE_DAYS) continue;
    const { title, source } = stripSource(rawTitle);
    const score = scoreOf(rawTitle);
    items.push({ title, link, source, date: pub, score });
  }
  return items;
}

async function main(): Promise<void> {
  const state = loadState();
  const seen = new Set(state.seen);

  // 전 쿼리 수집 → 지문 기준 dedup
  const byFp = new Map<string, Item>();
  for (const q of QUERIES) {
    try {
      for (const it of await fetchQuery(q)) {
        const fp = fingerprint(it.link, it.title);
        const prev = byFp.get(fp);
        if (!prev || it.score > prev.score) byFp.set(fp, it);
      }
    } catch (e) {
      console.log(`쿼리 실패 [${q}]: ${(e as Error).message}`);
    }
  }

  // 새 것 + 관련도 임계 통과만
  const fresh = [...byFp.entries()]
    .filter(([fp, it]) => !seen.has(fp) && it.score >= 5)
    .map(([, it]) => it)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ALERTS);

  console.log(`[${new Date().toISOString()}] 수집 ${byFp.size}건 / 새 관련공고 ${fresh.length}건`);
  fresh.forEach((f) => console.log(`  (${f.score}) ${f.title} — ${f.source}`));

  if (fresh.length && !DRY) {
    const lines = [
      "*📢 새 창업지원 공고 감지 (예비창업 감시망)*",
      "",
      ...fresh.map(
        (f) => `• <${f.link}|${f.title}> _${f.source}_`
      ),
      "",
      "_구글 뉴스 기반 자동 수집 — 자격요건(예비창업 여부·지역)은 원문 확인 필요_",
    ];
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    await slack.chat.postMessage({ channel: CHANNEL, text: lines.join("\n"), mrkdwn: true, unfurl_links: false });
    console.log("Slack 알림 전송 완료");
  }

  // 상태 갱신 — 이번에 본 모든 지문을 seen에 추가(알림 안 한 것도 기록해 재알림 방지)
  const allFps = [...byFp.keys()];
  const merged = [...allFps, ...state.seen];
  const nextSeen = [...new Set(merged)].slice(0, SEEN_KEEP);
  if (!DRY) writeFileSync(STATE_FILE, JSON.stringify({ seen: nextSeen, lastRun: new Date().toISOString() }));
}

main().catch((e) => {
  console.error("오류:", (e as Error).message);
  process.exit(1);
});
