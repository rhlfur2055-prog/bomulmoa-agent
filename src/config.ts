import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  return v;
}

export interface TeamMember {
  slackId: string;
  name: string;
  role: string;
}

function parseTeam(raw: string | undefined): TeamMember[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [slackId, name, role] = entry.split(":").map((x) => x.trim());
      return { slackId, name, role: role ?? "" };
    });
}

export const config = {
  // Slack 은 봇(index.ts) 실행 시에만 필요 — 리서치/CI 에서는 비어 있어도 됨
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
    appToken: process.env.SLACK_APP_TOKEN ?? "",
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
    notifyChannel: process.env.SLACK_NOTIFY_CHANNEL ?? "",
  },
  google: {
    sheetId: required("GOOGLE_SHEET_ID"),
    // 파일 경로 또는 인라인 JSON(GOOGLE_SERVICE_ACCOUNT_KEY, CI 시크릿용) 중 하나
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "./service-account.json",
    keyJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "",
    tabs: {
      prices: process.env.SHEET_TAB_PRICES ?? "단가표",
      intake: process.env.SHEET_TAB_INTAKE ?? "매입기록",
      worklog: process.env.SHEET_TAB_WORKLOG ?? "작업로그",
    },
  },
  anthropic: {
    // 없으면 AI 브리핑만 건너뜀 — 시세/뉴스 수집은 정상 동작
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  },
  team: parseTeam(process.env.TEAM_MEMBERS),
  watchIntervalSec: Number(process.env.WATCH_INTERVAL_SEC ?? "60"),
};

/** Slack 봇 실행에 필요한 토큰이 모두 있는지 검증 */
export function assertSlackConfig(): void {
  for (const k of ["botToken", "appToken", "signingSecret"] as const) {
    if (!config.slack[k]) throw new Error(`Slack 토큰 누락: ${k}. .env 를 확인하세요.`);
  }
}

/** Slack 사용자 ID로 팀원 정보를 찾는다 (없으면 이름만 반환) */
export function findMember(slackId: string): TeamMember | undefined {
  return config.team.find((m) => m.slackId === slackId);
}

/** 이름(또는 부분일치)으로 팀원을 찾는다 */
export function findMemberByName(name: string): TeamMember | undefined {
  const n = name.trim();
  return config.team.find((m) => m.name === n || m.name.includes(n));
}
