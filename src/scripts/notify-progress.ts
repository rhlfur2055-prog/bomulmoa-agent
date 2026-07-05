/**
 * notify-progress.ts — 진행 성과를 Slack 알림 채널에 1회 전송
 * 실행: npx tsx src/scripts/notify-progress.ts
 */
import { WebClient } from "@slack/web-api";
import { config } from "../config.js";

const text = [
  "*📦 보물모아 진행 현황 정리 (7/5)*",
  "",
  "*1. 홈페이지 리뉴얼 완료* — bomulmoa.com",
  "• AI 생성 현장 영상 3편(마당·품목·트럭 계량) 기반 메인 페이지 제작",
  "• 실시간 고철·비철 시세 연동 (`/api/prices`, gomulprice 크롤링 1시간 캐시) + 히어로 시세 티커",
  "• 문의 폼 → Slack 실시간 전달 (`/api/contact`)",
  "• 파트너 페이지에 *전자 매입대장·KYC 자동화* 항목 보강 (법적 의무 자동화 = 핵심 차별화)",
  "• 골드 브랜드 톤 통일 + 스크롤 등장 애니메이션으로 디자인 고도화",
  "",
  "*2. 홍보 쇼츠 제작 완료* — Remotion 파이프라인",
  "• 24초 세로형(1080×1920) : 훅 → 시세 카운터 → 매입 품목 → 트럭 계량 → CTA",
  "• 파일: `C:\\tool\\gree\\output\\bomulmoa-shorts.mp4` (+썸네일)",
  "",
  "*3. 배포 자동화(CI/CD)*",
  "• GitHub Actions: main 푸시 → Cloudflare Workers 자동배포 워크플로 추가",
  "• ⏳ 남은 것: Cloudflare API 토큰을 GitHub Secrets(`CLOUDFLARE_API_TOKEN`)에 등록",
  "• ⏳ 시세·뉴스 자동수집(6시간 주기)도 `GOOGLE_SHEET_ID`/`GOOGLE_SERVICE_ACCOUNT_KEY` Secrets 등록 대기",
  "",
  "*4. 저장소 현황*",
  "• `Treasure-Collective` — 사이트 + 워커 + 배포 워크플로 (푸시 완료)",
  "• `bomulmoa-agent` — 시세·뉴스 수집봇 + 홈페이지 시안 (푸시 완료)",
].join("\n");

async function main(): Promise<void> {
  const channel = process.argv[2] || config.slack.notifyChannel;
  if (!config.slack.botToken || !channel) {
    console.error("SLACK_BOT_TOKEN 또는 SLACK_NOTIFY_CHANNEL이 .env에 없습니다.");
    process.exit(1);
  }
  const client = new WebClient(config.slack.botToken);
  const res = await client.chat.postMessage({ channel, text, mrkdwn: true });
  console.log(`전송 완료: channel=${res.channel}, ts=${res.ts}`);
}

main().catch((e) => {
  console.error("전송 실패:", e?.data?.error ?? e?.message ?? e);
  process.exit(1);
});
