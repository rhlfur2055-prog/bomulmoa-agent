/** notify-drive-links.ts — 드라이브에 올린 산출물 링크를 팀 채널에 공유 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";

const text = [
  "*📂 보물모아 산출물 공유 (구글 드라이브)*",
  "",
  "• *사업계획서 (대표: 임동근)* — 경기도 예비·초기 기술창업지원 PSST 양식",
  "  <https://drive.google.com/file/d/1PHEhuFXtYs02YnsNQU0DMstRNS9KF4VQ/view|📄 보물모아_사업계획서(임동근).docx>",
  "  ⚠️ 문서 안 【기재 필요】 부분(대표 학력·경력, 오도경님 경력, 사업장 소재지) 채워주세요",
  "",
  "• *수익사업 조사보고서* — 국내외 검증사례 17건 + 추천 우선순위",
  "  <https://docs.google.com/document/d/1mWZuo0IobdwTEGMchfNe7oCZLP0iepwBKjQe55n79Go/edit|📊 보물모아_수익사업_조사보고서>",
  "  핵심: 시세 정보 구독은 국내외에서 이미 돈이 되는 검증된 모델 (스틸데일리 연 42~50만원, ScrapMonster $49~250/월)",
  "",
  "• *폴더 전체*: <https://drive.google.com/drive/folders/1w_1QjigDDfiNjC64j3kaFMsm5YD4jZfR|📁 보물모아 드라이브 폴더>",
  "",
  "홍보 쇼츠(24초)는 용량 관계로 로컬 보관: `C:\\tool\\gree\\output\\bomulmoa-shorts.mp4`",
].join("\n");

async function main(): Promise<void> {
  const c = new WebClient(process.env.SLACK_BOT_TOKEN);
  const res = await c.chat.postMessage({ channel: "C0BEHD6S7MX", text, mrkdwn: true });
  console.log(`전송 완료: ts=${res.ts}`);
}

main().catch((e) => {
  console.error("실패:", (e as { data?: { error?: string } }).data?.error ?? (e as Error).message);
  process.exit(1);
});
