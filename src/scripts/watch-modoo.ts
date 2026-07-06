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

  // 1차 소스: 구글 뉴스 RSS (서버에서 검증된 경로 — 공고가 나오면 뉴스가 먼저 뜸)
  let found = false;
  let evidence = "";
  try {
    const rssUrl =
      "https://news.google.com/rss/search?q=%22%EB%AA%A8%EB%91%90%EC%9D%98%20%EC%B0%BD%EC%97%85%22%202%EC%B0%A8&hl=ko&gl=KR&ceid=KR:ko";
    const rss = await (await fetch(rssUrl)).text();
    const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10);
    for (const m of items) {
      const title = (m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "");
      const pub = m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
      const ageDays = pub ? (Date.now() - new Date(pub).getTime()) / 86400000 : 999;
      const negative = /(미뤄|미뤄질|연기|지연|보류|무산|불투명|취소)/.test(title);
      if (ageDays <= 4 && !negative && /2\s*차/.test(title) && /(접수|시작|개시|돌입|공고)/.test(title)) {
        found = true;
        evidence = title;
        break;
      }
    }
    state.failCount = 0;
  } catch (e) {
    console.log(`[${new Date().toISOString()}] 뉴스 RSS 실패: ${(e as Error).message}`);
  }

  // 2차 소스: modoo.or.kr 직접 확인 (봇 차단이 있어 실패 허용)
  if (!found) {
    try {
      const res = await fetch(URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      });
      if (res.ok) {
        const text = (await res.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        if (/2\s*차/.test(text) && /(모집|접수|신청)/.test(text)) {
          found = true;
          evidence = "modoo.or.kr 페이지에서 감지";
        }
      } else {
        state.failCount += 1;
      }
    } catch {
      state.failCount += 1;
    }
  }

  console.log(`[${new Date().toISOString()}] 확인 완료 — 2차 공고 감지: ${found}${evidence ? ` (${evidence})` : ""}`);

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
