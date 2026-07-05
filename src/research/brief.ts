import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { getPrices } from "../sheets/prices";
import type { ScrapedPrice } from "./prices";
import type { NewsItem } from "./news";

/**
 * 스크래핑한 시세·뉴스와 우리 단가표를 비교해 AI가 짧은 시황 브리핑을 만든다.
 * GEMINI_API_KEY가 있으면 제미나이, 없으면 ANTHROPIC_API_KEY(Claude) 사용.
 * 매입가 조정 아이디어까지 제안하도록 유도.
 */
export async function makeBrief(prices: ScrapedPrice[], news: NewsItem[]): Promise<string> {
  const ourPrices = await getPrices().catch(() => []);

  const marketText = prices.map((p) => `- ${p.item}: ${p.price.toLocaleString()}원/kg (${p.category})`).join("\n");
  const ourText = ourPrices.map((p) => `- ${p.item}: 매입 ${p.buyPrice.toLocaleString()}원/kg`).join("\n");
  const newsText = news.slice(0, 8).map((n) => `- ${n.title}`).join("\n");

  const prompt = `너는 고물상 키오스크 스타트업 'Bomulmoa'의 시황 분석 담당이다.
아래는 오늘 수집한 외부 시장 시세, 우리 매입 단가표, 관련 뉴스다.

[외부 시장 시세]
${marketText || "(수집 실패)"}

[우리 매입 단가표]
${ourText || "(없음)"}

[관련 뉴스 헤드라인]
${newsText || "(없음)"}

위 정보를 바탕으로 5줄 이내로 한국어 브리핑을 작성해라:
1) 오늘 시장 흐름 한 줄 요약
2) 우리 매입가와 시장가 격차가 큰 품목 1~2개 (조정 제안)
3) 사업에 영향 줄 만한 뉴스 1개
불필요한 서론 없이 핵심만.`;

  if (config.gemini.apiKey) return briefWithGemini(prompt);
  return briefWithClaude(prompt);
}

/** 제미나이 REST API 호출 (SDK 의존성 없이 fetch 사용) */
async function briefWithGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (j.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("Gemini 응답이 비어 있음");
  return text;
}

async function briefWithClaude(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const res = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
