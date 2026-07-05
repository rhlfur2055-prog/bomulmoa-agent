/**
 * provision-server.ts — Vultr에 보물모아 봇 서버 생성 (서울, 1vCPU/1GB, Ubuntu 24.04)
 * 실행: npx tsx src/scripts/provision-server.ts
 * API 키는 .env의 VULTR_API_KEY 사용. 키 값은 출력하지 않음.
 */
import "dotenv/config";
import { readFileSync } from "fs";

const API = "https://api.vultr.com/v2";
const KEY = process.env.VULTR_API_KEY;
const LABEL = "bomulmoa-bot";
const SSH_PUB_PATH = `${process.env.USERPROFILE?.replace(/\\/g, "/")}/.ssh/bomulmoa_vultr.pub`;

async function vultr(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function main(): Promise<void> {
  if (!KEY) throw new Error("VULTR_API_KEY 없음");

  // 0. 이미 같은 라벨의 서버가 있으면 중복 생성 방지
  const existing = (await vultr("/instances")).instances?.find((i: any) => i.label === LABEL);
  if (existing) {
    console.log(`이미 서버가 있습니다: ${existing.id} / IP ${existing.main_ip} / 상태 ${existing.status}`);
    return;
  }

  // 1. SSH 공개키 등록 (이미 있으면 재사용)
  const pub = readFileSync(SSH_PUB_PATH, "utf8").trim();
  const keys = (await vultr("/ssh-keys")).ssh_keys ?? [];
  let sshKeyId = keys.find((k: any) => k.name === "bomulmoa-vultr")?.id;
  if (!sshKeyId) {
    const created = await vultr("/ssh-keys", {
      method: "POST",
      body: JSON.stringify({ name: "bomulmoa-vultr", ssh_key: pub }),
    });
    sshKeyId = created.ssh_key.id;
    console.log("SSH 키 등록 완료");
  } else {
    console.log("기존 SSH 키 재사용");
  }

  // 2. Ubuntu 24.04 os_id 조회
  const osList = (await vultr("/os?per_page=500")).os ?? [];
  const ubuntu = osList.find((o: any) => /Ubuntu 24\.04/i.test(o.name) && /x64/i.test(o.arch ?? "x64"));
  if (!ubuntu) throw new Error("Ubuntu 24.04 os_id를 찾지 못함");
  console.log(`OS: ${ubuntu.name} (id ${ubuntu.id})`);

  // 3. 인스턴스 생성 — 서울(icn), 1vCPU/1GB (vc2-1c-1gb)
  const inst = (
    await vultr("/instances", {
      method: "POST",
      body: JSON.stringify({
        region: "icn",
        plan: "vc2-1c-1gb",
        os_id: ubuntu.id,
        label: LABEL,
        hostname: "bomulmoa-bot",
        sshkey_id: [sshKeyId],
        backups: "disabled",
        activation_email: false,
      }),
    })
  ).instance;
  console.log(`서버 생성 요청 완료: id ${inst.id}`);

  // 4. 부팅 대기 (최대 5분)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const cur = (await vultr(`/instances/${inst.id}`)).instance;
    console.log(`  상태: ${cur.status} / power: ${cur.power_status} / IP: ${cur.main_ip}`);
    if (cur.status === "active" && cur.main_ip !== "0.0.0.0") {
      console.log(`✅ 서버 준비 완료 — IP: ${cur.main_ip} (월 $6 과금 시작)`);
      return;
    }
  }
  console.log("⏱️ 5분 내에 활성화되지 않음 — 잠시 후 상태를 다시 확인하세요.");
}

main().catch((e) => {
  console.error("실패:", (e as Error).message);
  process.exit(1);
});
