/**
 * crawl-grants.ts — 「모두의 창업」류 창업·중소기업 지원사업 공고 통합 크롤러 (1회 실행)
 *
 * 기업마당·K-Startup·구글뉴스 등 여러 소스에서 지원사업 공고를 한 번에 긁어
 *   1) Google Sheets '지원사업' 탭에 신규 공고만 누적 저장
 *   2) 접수 마감 임박(D-14 이내) 공고를 Slack #보물모아-전체 채널로 요약 알림
 *
 * 서버(egress 열린 환경) cron 에서 하루 1회 실행 권장.
 * 실행: npx tsx src/scripts/crawl-grants.ts             (시트 저장 + Slack 알림)
 *       npx tsx src/scripts/crawl-grants.ts --dry       (수집 결과만 콘솔 출력)
 *       npx tsx src/scripts/crawl-grants.ts --no-slack  (시트 저장만, 알림 없음)
 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { collectGrants, type Grant } from "../research/grants";
import { ensureGrantsTab, saveGrants } from "../sheets/grants";

const CHANNEL =
  process.env.SLACK_NOTIFY_CHANNEL && process.env.SLACK_NOTIFY_CHANNEL.startsWith("C")
    ? process.env.SLACK_NOTIFY_CHANNEL
    : "C0BEHD6S7MX"; // #보물모아-전체
const DRY = process.argv.includes("--dry");
const NO_SLACK = process.argv.includes("--no-slack");

/** 마감일까지 남은 일수 (파싱 실패/무기한 시 null) */
function daysLeft(endDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
  const diff = (new Date(endDate + "T23:59:59+09:00").getTime() - Date.now()) / 86400000;
  return Math.floor(diff);
}

function fmtGrant(g: Grant): string {
  const d = daysLeft(g.endDate);
  const dd = d === null ? "" : d < 0 ? " ~마감" : d === 0 ? " *오늘마감*" : ` D-${d}`;
  const meta = [g.org, g.field, g.region].filter(Boolean).join(" · ");
  const head = g.link ? `<${g.link}|${g.title}>` : g.title;
  return `• ${head}${dd}${meta ? ` _(${meta})_` : ""}`;
}

async function main(): Promise<void> {
  console.log(`[${new Date().toISOString()}] 지원사업 크롤링 시작`);
  const grants = await collectGrants();
  console.log(`수집 완료: ${grants.length}건 (소스별 중복 제거 후)`);

  // 마감 임박순 정렬 (무기한/파싱실패는 뒤로)
  const sorted = [...grants].sort((a, b) => {
    const da = daysLeft(a.endDate);
    const db = daysLeft(b.endDate);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  sorted.slice(0, 40).forEach((g) => {
    const d = daysLeft(g.endDate);
    console.log(`  [${g.source}] ${g.title}${d === null ? "" : ` (D-${d})`} ${g.link}`);
  });

  if (DRY) {
    console.log("--dry: 시트 저장·Slack 알림 생략");
    return;
  }

  // 1) 시트 저장 (신규만)
  let added = 0;
  try {
    await ensureGrantsTab();
    added = await saveGrants(grants);
    console.log(`시트 '지원사업' 탭에 신규 ${added}건 저장`);
  } catch (e) {
    console.log(`시트 저장 실패(건너뜀): ${(e as Error).message}`);
  }

  // 2) Slack 알림 — 접수 마감 임박(D-14 이내)만 추려서
  if (!NO_SLACK && process.env.SLACK_BOT_TOKEN) {
    const soon = sorted
      .filter((g) => {
        const d = daysLeft(g.endDate);
        return d !== null && d >= 0 && d <= 14;
      })
      .slice(0, 12);
    if (soon.length) {
      const lines = [
        `*📋 창업·중소기업 지원사업 크롤링 (${grants.length}건 수집${added ? `, 신규 ${added}건` : ""})*`,
        "*⏰ 접수 마감 임박 (D-14 이내)*",
        "",
        ...soon.map(fmtGrant),
        "",
        "_기업마당·K-Startup·구글뉴스 통합 자동 수집 — 자격요건은 원문 확인 필요_",
      ];
      const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
      await slack.chat.postMessage({
        channel: CHANNEL,
        text: lines.join("\n"),
        mrkdwn: true,
        unfurl_links: false,
      });
      console.log(`Slack 알림 전송 완료 (마감임박 ${soon.length}건)`);
    } else {
      console.log("마감 임박 공고 없음 — Slack 알림 생략");
    }
  }
  console.log(`[${new Date().toISOString()}] 완료`);
}

main().catch((e) => {
  console.error("오류:", (e as Error).message);
  process.exit(1);
});
