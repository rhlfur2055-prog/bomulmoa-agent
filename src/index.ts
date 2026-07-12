import { App } from "@slack/bolt";
import { config, findMember, assertSlackConfig } from "./config";
import { runAgent } from "./agent/agent";
import { getPrices } from "./sheets/prices";
import { addIntake, getTodayIntake } from "./sheets/intake";
import { logWork, getDaySummary } from "./sheets/worklog";
import { getGrants, ensureGrantsTab } from "./sheets/grants";
import { readMarket, ensureResearchTabs, type MarketPrice } from "./sheets/research";
import { won } from "./format";
import { startPriceWatcher } from "./watcher";
import { ensureAllTabs } from "./scripts/initSheets";

assertSlackConfig(); // Slack 토큰 검증 (봇 실행 전용)

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
});

// ─────────────────────────────────────────────
//  명령 로직 (문자열 응답 반환) — 여러 명령 이름에 재사용
// ─────────────────────────────────────────────

/** 단가 조회 */
async function doPrice(text: string): Promise<string> {
  const prices = await getPrices();
  const q = text.trim();
  const list = q ? prices.filter((p) => p.item.includes(q)) : prices;
  if (!list.length) return `'${q}' 품목을 찾지 못했어요.`;
  const lines = list.map((p) => `• *${p.item}* (${p.category}) — 매입 ${won(p.buyPrice)} / 판매 ${won(p.sellPrice)}`);
  return `💰 단가표${q ? ` (검색: ${q})` : ""}\n${lines.join("\n")}`;
}

/** 매입 기록 */
async function doBuy(text: string, userId: string): Promise<string> {
  const [customer, item, weightRaw] = text.trim().split(/\s+/);
  const weight = Number(weightRaw);
  if (!customer || !item || !weight) return "사용법: `/buy(=/매입) 고객명 품목 무게kg`  예) `/buy 홍길동 고철 20`";
  const handler = findMember(userId)?.name ?? "미상";
  const r = await addIntake({ handler, customer, item, weightKg: weight });
  return `📥 매입 기록 완료\n• 담당: ${handler} · 고객: ${customer}\n• ${item} ${weight}kg × ${won(r.unitPrice)} = *${won(r.amount)}*`;
}

/** 작업 로그 (하루 목표 1시간) */
async function doLog(text: string, userId: string, userName: string): Promise<string> {
  const parts = text.trim().split(/\s+/);
  const hoursVal = Number(parts.pop());
  const description = parts.join(" ");
  if (!description || !hoursVal) return "사용법: `/log(=/작업) 작업내용 시간`  예) `/log 이미지분류조사 1`";
  const member = findMember(userId);
  await logWork({ member: member?.name ?? userName, role: member?.role ?? "", description, hours: hoursVal });
  const goal = hoursVal >= 1 ? "✅ 오늘 목표(1h) 달성" : "⏳ 목표 1h 미달";
  return `📝 작업 기록: ${member?.name ?? userName} — ${description} (${hoursVal}h) ${goal}`;
}

/** 오늘 팀 현황 */
async function doToday(): Promise<string> {
  const [work, intake] = await Promise.all([getDaySummary(), getTodayIntake()]);
  const workLines = work.length
    ? work.map((w) => `• ${w.member}(${w.role}) — *${w.hours}h* ${w.hours >= 1 ? "✅" : "⏳"} · ${w.tasks}건`).join("\n")
    : "• 아직 기록된 작업 없음 (하루 목표 1h)";
  return `📊 *오늘 현황*\n\n*팀 작업량* (목표 1h)\n${workLines}\n\n*매입*\n• ${intake.count}건 · 총 ${won(intake.total)}`;
}

/** 지원사업 조회 — 진행중(마감 안 지난) 공고를 마감 임박순으로 */
async function doGrants(text: string): Promise<string> {
  await ensureGrantsTab(); // 최초 조회 시 탭이 없어도 안전
  const rows = await getGrants();
  const q = text.trim();
  const filtered = q
    ? rows.filter((g) => `${g.title} ${g.org} ${g.field} ${g.region} ${g.target}`.includes(q))
    : rows;
  if (!filtered.length) {
    return q
      ? `'${q}' 관련 지원사업을 찾지 못했어요. (서버에서 \`npm run crawl-grants\` 로 수집)`
      : "아직 수집된 지원사업이 없어요. 서버에서 `npm run crawl-grants` 실행 후 다시 시도하세요.";
  }
  const dleft = (end: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
    return Math.floor((new Date(end + "T23:59:59+09:00").getTime() - Date.now()) / 86400000);
  };
  const open = filtered.filter((g) => {
    const d = dleft(g.endDate);
    return d === null || d >= 0; // 진행중 또는 마감일 미상
  });
  open.sort((a, b) => {
    const da = dleft(a.endDate);
    const db = dleft(b.endDate);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  const shown = open.slice(0, 15);
  const lines = shown.map((g) => {
    const d = dleft(g.endDate);
    const dd = d === null ? "" : d === 0 ? " *오늘마감*" : d > 0 ? ` D-${d}` : " ~마감";
    const meta = [g.org, g.field, g.region].filter(Boolean).join(" · ");
    const head = g.link ? `<${g.link}|${g.title}>` : g.title;
    return `• ${head}${dd}${meta ? ` _(${meta})_` : ""}`;
  });
  const more = open.length > shown.length ? `\n_…외 ${open.length - shown.length}건 (검색어로 좁혀보세요)_` : "";
  return `📋 *지원사업 공고* (진행중 ${open.length}건${q ? ` · 검색: ${q}` : ""})\n${lines.join("\n")}${more}`;
}

/** 고물상 실제 시장 시세 조회 — 시세조사 탭의 품목별 최신 스냅샷 */
async function doMarket(text: string): Promise<string> {
  await ensureResearchTabs(); // 최초 조회 시 탭이 없어도 안전
  const rows = await readMarket();
  const q = text.trim();
  const list = q ? rows.filter((m) => m.item.includes(q) || m.category.includes(q)) : rows;
  if (!list.length) {
    return rows.length === 0
      ? "아직 수집된 시세가 없어요. 서버에서 `npm run research` 를 실행하면 채워집니다.\n지금 바로 알고 싶으면 저를 *멘션*해서 “구리 시세 검색해줘”라고 하면 실시간으로 찾아드려요."
      : `‘${q}’ 시세를 찾지 못했어요. 저를 *멘션*해서 실시간 검색을 요청해보세요. (예: “${q} 시세 검색해줘”)`;
  }
  const asof = list.map((m) => m.collectedAt).filter(Boolean).sort().slice(-1)[0] ?? "";
  const byCat = new Map<string, MarketPrice[]>();
  for (const m of list) {
    const k = m.category || "기타";
    const arr = byCat.get(k) ?? [];
    arr.push(m);
    byCat.set(k, arr);
  }
  const blocks: string[] = [];
  for (const [cat, items] of byCat) {
    items.sort((a, b) => b.price - a.price);
    blocks.push(`*${cat}*\n` + items.map((m) => `• ${m.item} — *${won(m.price)}*/kg`).join("\n"));
  }
  const sources = [...new Set(list.map((m) => m.source).filter(Boolean))].join(", ");
  return `📈 *고물상 실제 시세*${asof ? ` (${asof} 수집)` : ""}${q ? ` · 검색: ${q}` : ""}\n${blocks.join("\n\n")}${sources ? `\n\n_출처: ${sources} · 우리 매입가는 \`/단가\` 참고_` : ""}`;
}

/** 도움말 */
async function doHelp(): Promise<string> {
  return [
    "🪙 *Bomulmoa 봇 명령어*",
    "• `/price` (`/단가`) [품목] — 단가 조회",
    "• `/buy` (`/매입`) 고객 품목 무게 — 매입 기록",
    "• `/log` (`/작업`) 내용 시간 — 작업 기록 (목표 1h)",
    "• `/today` (`/오늘`) — 오늘 팀 현황",
    "• `/grants` (`/지원사업`) [검색어] — 창업·중소기업 지원사업 공고 조회",
    "• `/market` (`/시세`) [품목] — 고물상 실제 시장 시세 (수집된 최신값)",
    "• 또는 저를 *멘션/DM* 해서 한국어로 자유롭게: \"구리 시세 검색해줘\", \"임동근 조사 1시간\"",
  ].join("\n");
}

// ── 명령 등록 (영문 + 한글 별칭 동시) ─────────────────────
function register(names: string[], run: (text: string, userId: string, userName: string) => Promise<string>) {
  for (const name of names) {
    app.command(name, async ({ command, ack, respond, body }) => {
      await ack();
      try {
        await respond(await run(command.text, body.user_id, body.user_name));
      } catch (e) {
        await respond(`⚠ 오류: ${(e as Error).message}`);
      }
    });
  }
}

register(["/price", "/단가"], (t) => doPrice(t));
register(["/buy", "/매입"], (t, uid) => doBuy(t, uid));
register(["/log", "/작업"], (t, uid, uname) => doLog(t, uid, uname));
register(["/today", "/오늘"], () => doToday());
register(["/grants", "/지원사업"], (t) => doGrants(t));
register(["/market", "/시세"], (t) => doMarket(t));
register(["/help", "/도움"], () => doHelp());

// ── @멘션 & DM : AI 자연어 에이전트 (웹검색·시트·메모리) ────
app.event("app_mention", async ({ event, say }) => {
  const text = event.text.replace(/<@[^>]+>/g, "").trim();
  const userName = findMember(event.user ?? "")?.name;
  const threadKey = event.thread_ts ?? event.ts;
  const reply = await runAgent(text, { userName, threadKey });
  await say({ text: reply, thread_ts: event.ts });
});

app.message(async ({ message, say }) => {
  const m = message as any;
  if (m.channel_type !== "im" || m.subtype || !m.text) return;
  const userName = findMember(m.user)?.name;
  const reply = await runAgent(m.text, { userName, threadKey: m.channel });
  await say(reply);
});

(async () => {
  // 구글 서비스계정이 아직 없어도 봇은 뜨게 함 (Slack 토큰만으로 /help 확인 가능)
  try {
    await ensureAllTabs();
  } catch (e) {
    console.warn("⚠ 구글 시트 미연결 — 시트 명령은 서비스계정 설정 후 동작합니다:", (e as Error).message);
  }
  await app.start();
  console.log("⚡ Bomulmoa 에이전트 실행 중 (Socket Mode) — /help 로 확인하세요");
  startPriceWatcher(app);
})();
