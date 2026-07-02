import Anthropic from "@anthropic-ai/sdk";
import { config, findMemberByName } from "../config";
import { getPrices, findPrice, updatePrice } from "../sheets/prices";
import { addIntake, getTodayIntake } from "../sheets/intake";
import { logWork, getDaySummary } from "../sheets/worklog";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

// ── 커스텀 도구(구글시트 조작) ────────────────────────────
const SHEET_TOOLS = [
  { name: "get_prices", description: "우리 매입/판매 단가표 전체 조회.", input_schema: { type: "object" as const, properties: {} } },
  {
    name: "find_price",
    description: "특정 품목의 우리 단가 조회. 예: '구리 단가?'",
    input_schema: { type: "object" as const, properties: { item: { type: "string", description: "품목명" } }, required: ["item"] },
  },
  {
    name: "update_price",
    description: "품목 매입/판매 단가 수정(시세 반영). 바꿀 값만 전달.",
    input_schema: {
      type: "object" as const,
      properties: { item: { type: "string" }, buy_price: { type: "number" }, sell_price: { type: "number" } },
      required: ["item"],
    },
  },
  {
    name: "add_intake",
    description: "고물 매입 1건 기록. 지급액 자동계산. 예: '고철 20kg 홍길동 매입'",
    input_schema: {
      type: "object" as const,
      properties: {
        handler: { type: "string" }, customer: { type: "string" },
        item: { type: "string" }, weight_kg: { type: "number" }, note: { type: "string" },
      },
      required: ["handler", "customer", "item", "weight_kg"],
    },
  },
  {
    name: "log_work",
    description: "팀원 오늘 작업 기록(하루 목표 1시간). 예: '임동근 이미지분류 조사 1시간'",
    input_schema: {
      type: "object" as const,
      properties: { member: { type: "string" }, description: { type: "string" }, hours: { type: "number" } },
      required: ["member", "description", "hours"],
    },
  },
  { name: "get_today_summary", description: "오늘 팀원별 작업량+매입 현황 집계.", input_schema: { type: "object" as const, properties: {} } },
];

// ── 서버사이드 도구(Anthropic 실행): 봇이 직접 웹 검색/조회 ──
const SERVER_TOOLS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
];

const TOOLS = [...SHEET_TOOLS, ...SERVER_TOOLS] as Anthropic.Messages.ToolUnion[];

const SHEET_TOOL_NAMES = new Set(SHEET_TOOLS.map((t) => t.name));

// 시스템 프롬프트는 캐싱을 위해 고정(안정 프리픽스) 유지
const SYSTEM = `너는 고물상 키오스크 스타트업 'Bomulmoa'의 Slack 업무 비서 겸 리서치 에이전트다.
팀원: 오도경(프론트), 임동근(AI), 임혁진(백엔드). 하루 작업 목표 1시간. UI/UX 담당은 추후 모집.
행동 원칙:
- 시트 작업(매입기록·단가·작업로그)은 커스텀 도구로 처리한다.
- 시세/뉴스/시장정보 등 외부 최신 정보가 필요하면 web_search·web_fetch 로 직접 찾아본다.
- 금액은 천단위 콤마와 '원'으로 읽기 쉽게. 데이터를 바꾸면 무엇이 바뀌었는지 확인해준다.
- 정보가 부족하면 추측 말고 되묻는다. Slack이므로 짧고 명확하게, 필요하면 이모지.`;

/** Slack 스레드별 대화 메모리 (맥락 유지) */
const threads = new Map<string, Anthropic.MessageParam[]>();

export interface AgentOpts {
  userName?: string;
  threadKey?: string; // 같은 스레드/DM 이면 맥락 유지
}

/** 커스텀 도구 실행 → 결과 문자열(JSON) */
async function runSheetTool(name: string, input: any): Promise<string> {
  switch (name) {
    case "get_prices":
      return JSON.stringify(await getPrices());
    case "find_price":
      return JSON.stringify((await findPrice(input.item)) ?? { error: `'${input.item}' 없음` });
    case "update_price":
      return JSON.stringify((await updatePrice(input.item, input.buy_price, input.sell_price)) ?? { error: "품목 없음" });
    case "add_intake":
      return JSON.stringify(
        await addIntake({ handler: input.handler, customer: input.customer, item: input.item, weightKg: input.weight_kg, note: input.note })
      );
    case "log_work": {
      const m = findMemberByName(input.member);
      return JSON.stringify(await logWork({ member: input.member, role: m?.role ?? "", description: input.description, hours: input.hours }));
    }
    case "get_today_summary": {
      const [work, intake] = await Promise.all([getDaySummary(), getTodayIntake()]);
      return JSON.stringify({ work, intake });
    }
    default:
      return JSON.stringify({ error: `알 수 없는 도구 ${name}` });
  }
}

/**
 * 자연어 요청을 처리하는 에이전트 하네스.
 * - adaptive thinking + effort, 프롬프트 캐싱, 서버 웹툴, 스레드 메모리, tool-use 루프
 */
export async function runAgent(text: string, opts: AgentOpts = {}): Promise<string> {
  const key = opts.threadKey ?? "default";
  const prior = threads.get(key) ?? [];
  const messages: Anthropic.MessageParam[] = [
    ...prior,
    { role: "user", content: opts.userName ? `[요청자: ${opts.userName}]\n${text}` : text },
  ];

  for (let step = 0; step < 8; step++) {
    const res = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" }, // 챗봇 응답성/품질 균형
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    // 서버툴 루프가 iteration 한도에 걸림 → 그대로 재전송해 이어가기
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    // 커스텀(클라이언트) 도구 호출 처리
    if (res.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === "tool_use" && SHEET_TOOL_NAMES.has(block.name)) {
          let out: string;
          try {
            out = await runSheetTool(block.name, block.input);
          } catch (e) {
            out = JSON.stringify({ error: String(e) });
          }
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
      }
      // 처리할 커스텀 도구가 없으면(서버툴만) 루프 이탈 방지용 continue
      if (results.length) messages.push({ role: "user", content: results });
      continue;
    }

    if (res.stop_reason === "refusal") return "죄송해요, 그 요청은 처리할 수 없어요.";

    // 최종 답변
    const answer = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    // 스레드 메모리 저장 (최근 20개만)
    const assistantMsg: Anthropic.MessageParam = { role: "assistant", content: res.content };
    threads.set(key, [...messages, assistantMsg].slice(-20));
    return answer || "처리했어요.";
  }
  return "요청이 복잡해요. 조금 더 구체적으로 말해 주세요.";
}
