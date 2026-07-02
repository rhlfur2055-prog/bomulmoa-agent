import type { App } from "@slack/bolt";
import { config } from "./config";
import { getPrices, PriceRow } from "./sheets/prices";
import { won } from "./format";

/**
 * 단가표를 주기적으로 스냅샷 비교해 변경을 감지하고 Slack 채널에 알린다.
 * (Google Sheets는 푸시 웹훅이 없으므로 폴링 방식)
 */
export function startPriceWatcher(app: App): void {
  const interval = config.watchIntervalSec;
  const channel = config.slack.notifyChannel;
  if (interval <= 0 || !channel) {
    console.log("ℹ️  단가 변경 감지 비활성화 (WATCH_INTERVAL_SEC=0 또는 채널 미설정)");
    return;
  }

  let prev: Map<string, PriceRow> | null = null;

  const snapshot = async () => {
    try {
      const prices = await getPrices();
      const cur = new Map(prices.map((p) => [p.item, p]));
      if (prev) {
        const changes: string[] = [];
        for (const [item, p] of cur) {
          const old = prev.get(item);
          if (!old) {
            changes.push(`🆕 *${item}* 추가 (매입 ${won(p.buyPrice)} / 판매 ${won(p.sellPrice)})`);
          } else if (old.buyPrice !== p.buyPrice || old.sellPrice !== p.sellPrice) {
            changes.push(
              `✏️ *${item}* 매입 ${won(old.buyPrice)}→${won(p.buyPrice)}, 판매 ${won(old.sellPrice)}→${won(p.sellPrice)}`
            );
          }
        }
        for (const item of prev.keys()) {
          if (!cur.has(item)) changes.push(`🗑️ *${item}* 삭제됨`);
        }
        if (changes.length) {
          await app.client.chat.postMessage({
            channel,
            text: `📣 단가표 변경 감지\n${changes.join("\n")}`,
          });
        }
      }
      prev = cur;
    } catch (e) {
      console.error("단가 감지 오류:", e);
    }
  };

  snapshot(); // 시작 시 1회 스냅샷
  setInterval(snapshot, interval * 1000);
  console.log(`✅ 단가 변경 감지 시작 (${interval}초 주기 → <#${channel}>)`);
}
