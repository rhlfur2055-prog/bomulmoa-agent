/**
 * check-keys.ts — .env의 키들이 실제 작동하는지 점검 (키 값은 절대 출력하지 않음)
 * 실행: npx tsx src/scripts/check-keys.ts
 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";

async function main(): Promise<void> {
  // 1. Vultr API 키 테스트
  const vultrKey = process.env.VULTR_API_KEY;
  if (!vultrKey) {
    console.log("Vultr      : ❌ 키 없음");
  } else {
    try {
      const r = await fetch("https://api.vultr.com/v2/account", {
        headers: { Authorization: `Bearer ${vultrKey}` },
      });
      if (r.ok) {
        const j = (await r.json()) as { account?: { name?: string } };
        console.log(`Vultr      : ✅ 정상 (계정: ${j.account?.name ?? "확인됨"})`);
      } else {
        console.log(`Vultr      : ❌ 인증 실패 (HTTP ${r.status}) — 키가 잘못됐거나 IP 차단`);
      }
    } catch (e) {
      console.log("Vultr      : ❌ 접속 오류", (e as Error).message);
    }
  }

  // 2. Slack 봇 토큰 테스트
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    console.log("Slack 봇   : ❌ 토큰 없음");
  } else {
    try {
      const auth = await new WebClient(slackToken).auth.test();
      console.log(`Slack 봇   : ✅ 정상 (봇: ${auth.user}, 워크스페이스: ${auth.team})`);
    } catch (e) {
      const err = (e as { data?: { error?: string } }).data?.error ?? (e as Error).message;
      console.log(`Slack 봇   : ❌ 인증 실패 (${err})`);
    }
  }

  // 3. 나머지 키 존재 여부 (값 미출력)
  const optional: Array<[string, string]> = [
    ["SLACK_APP_TOKEN", "봇 실시간 연결용 (xapp-) — 서버에서 봇 돌릴 때 필요"],
    ["SLACK_SIGNING_SECRET", "봇 요청 검증용 — 서버에서 봇 돌릴 때 필요"],
    ["SLACK_NOTIFY_CHANNEL", "알림 보낼 채널"],
    ["GOOGLE_SHEET_ID", "시세 기록용 구글 시트"],
    ["GOOGLE_SERVICE_ACCOUNT_KEY_FILE", "구글 서비스계정 키 파일 경로"],
    ["GEMINI_API_KEY", "AI 브리핑용 제미나이 (선택)"],
    ["ANTHROPIC_API_KEY", "AI 브리핑용 Claude (선택)"],
  ];
  console.log("--- 나머지 키 보유 현황 ---");
  for (const [name, desc] of optional) {
    const has = !!process.env[name];
    console.log(`${has ? "✅" : "❌"} ${name} — ${desc}`);
  }
}

main();
