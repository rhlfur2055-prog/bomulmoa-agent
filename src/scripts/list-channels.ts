/** list-channels.ts — 봇이 접근 가능한 채널 목록 출력 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";

async function main(): Promise<void> {
  console.log("설정된 채널 ID:", process.env.SLACK_NOTIFY_CHANNEL);
  const c = new WebClient(process.env.SLACK_BOT_TOKEN);
  const r = await c.conversations.list({ types: "public_channel,private_channel", limit: 100 });
  for (const ch of r.channels ?? []) {
    console.log(`${ch.is_member ? "BOT-IN " : "not-in "} ${ch.id}  #${ch.name}`);
  }
}

main().catch((e) => {
  console.error("ERR", (e as { data?: { error?: string } }).data?.error ?? (e as Error).message);
  process.exit(1);
});
