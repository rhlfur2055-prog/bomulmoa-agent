/** delete-old-server.ts — 구형 Vultr 서버(45.32.221.17) 삭제 (사용자 승인 완료) */
import "dotenv/config";

async function main(): Promise<void> {
  const H = { Authorization: `Bearer ${process.env.VULTR_API_KEY}` };
  const j = (await (await fetch("https://api.vultr.com/v2/instances", { headers: H })).json()) as {
    instances?: Array<{ id: string; main_ip: string; plan: string; label: string }>;
  };
  const old = (j.instances ?? []).find((i) => i.main_ip === "45.32.221.17");
  if (!old) {
    console.log("구형 서버를 찾지 못함 — 이미 삭제됐을 수 있음");
    return;
  }
  console.log(`삭제 대상: ${old.id} / ${old.main_ip} / ${old.plan}`);
  const r = await fetch(`https://api.vultr.com/v2/instances/${old.id}`, { method: "DELETE", headers: H });
  console.log(`삭제 요청: ${r.status === 204 ? "✅ 성공 (과금 중지)" : `실패 HTTP ${r.status}`}`);
}

main().catch((e) => {
  console.error("실패:", (e as Error).message);
  process.exit(1);
});
