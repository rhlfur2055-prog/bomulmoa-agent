/** upload-files.ts — 산출물 파일들을 Slack 채널에 업로드 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { createReadStream } from "fs";

const CHANNEL = "C0BEHD6S7MX"; // #보물모아-전체

const FILES: Array<{ path: string; title: string }> = [
  { path: "C:/Users/컴퓨터/Documents/보물모아_사업계획서(임동근).docx", title: "보물모아 사업계획서 (임동근) — 【기재 필요】 부분 채워주세요" },
  { path: "C:/Users/컴퓨터/Documents/보물모아_수익사업_조사보고서.md", title: "수익사업 조사보고서 (검증사례 17건)" },
  { path: "C:/tool/gree/output/bomulmoa-shorts.mp4", title: "보물모아 홍보 쇼츠 (24초, 유튜브용)" },
];

async function main(): Promise<void> {
  const c = new WebClient(process.env.SLACK_BOT_TOKEN);
  for (const f of FILES) {
    try {
      await c.files.uploadV2({
        channel_id: CHANNEL,
        file: createReadStream(f.path),
        filename: f.path.split("/").pop(),
        title: f.title,
      });
      console.log(`✅ 업로드: ${f.title}`);
    } catch (e) {
      const err = (e as { data?: { error?: string } }).data?.error ?? (e as Error).message;
      console.log(`❌ 실패 (${err}): ${f.title}`);
    }
  }
}

main();
