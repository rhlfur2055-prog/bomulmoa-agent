/**
 * watch-modoo.ts — 「모두의 창업」 2차 모집 공고 감시
 * modoo.or.kr 메인 페이지에서 "2차 + 모집/접수/신청" 키워드가 감지되면
 * Slack #보물모아-전체 채널로 1회 알림. (상태 파일로 중복 알림 방지)
 * 서버 cron에서 2시간마다 실행.
 */
import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { readFileSync, writeFileSync } from "fs";

const CHANNEL = "C0BE97N1GH1" === process.env.SLACK_NOTIFY_CHANNEL ? "C0BEHD6S7MX" : (process.env.SLACK_NOTIFY_CHANNEL ?? "C0BEHD6S7MX");
const STATE_FILE = ".modoo-state.json";
const URL = "https://www.modoo.or.kr/";

interface State {
  notified: boolean;
  lastCheck: string;
  failCount: number;
}

function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return { notified: false, lastCheck: "", failCount: 0 };
  }
}

async function main(): Promise<void> {
  const state = loadState();
  if (state.notified) {
    console.log(`[${new Date().toISOString()}] 이미 알림 완료 — 감시 종료 상태`);
    return;
  }

  let html = "";
  try {
    const res = await fetch(URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
    state.failCount = 0;
  } catch (e) {
    state.failCount += 1;
    console.log(`[${new Date().toISOString()}] 접속 실패(${state.failCount}회): ${(e as Error).message}`);
    state.lastCheck = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state));
    return;
  }

  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const found = /2\s*차/.test(text) && /(모집|접수|신청)/.test(text);
  console.log(`[${new Date().toISOString()}] 확인 완료 — 2차 공고 감지: ${found}`);

  if (found) {
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    await slack.chat.postMessage({
      channel: CHANNEL,
      text: [
        "*🚨 「모두의 창업」 2차 모집 공고 감지!*",
        "",
        "modoo.or.kr 에서 '2차 + 모집/접수' 키워드가 확인됐습니다.",
        `👉 지금 확인: ${URL}`,
        "",
        "다음 행동:",
        "1. 공고 내용·접수 마감일 확인",
        "2. modoo.or.kr 회원가입 (아직이면)",
        "3. Claude에게 \"모두의창업 서식 나왔어\"라고 알려주면 지원서 초안 즉시 작성",
      ].join("\n"),
      mrkdwn: true,
    });
    state.notified = true;
    console.log("Slack 알림 전송 완료 — 감시 종료");
  }

  state.lastCheck = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

main().catch((e) => {
  console.error("오류:", (e as Error).message);
  process.exit(1);
});
