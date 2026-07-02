import { runResearch } from "./run";

/**
 * 리서치를 주기적으로 자동 실행 (기본 6시간마다).
 * 실행: npm run research:watch
 * (PC를 계속 켜둬야 함. 상시 운영은 서버/클라우드 배포나 Windows 작업 스케줄러 권장)
 */
const HOURS = Number(process.env.RESEARCH_INTERVAL_HOURS ?? "6");
const intervalMs = HOURS * 60 * 60 * 1000;

async function tick() {
  try {
    await runResearch();
  } catch (e) {
    console.error("리서치 실행 오류:", e);
  }
}

console.log(`⏰ 리서치 스케줄러 시작 — ${HOURS}시간마다 실행`);
tick(); // 시작 시 즉시 1회
setInterval(tick, intervalMs);
