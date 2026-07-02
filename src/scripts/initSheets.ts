import { config } from "../config";
import { ensureTab } from "../sheets/client";
import { INTAKE_HEADER } from "../sheets/intake";
import { WORKLOG_HEADER } from "../sheets/worklog";

const PRICES_HEADER = ["품목", "분류", "매입단가(원/kg)", "판매단가(원/kg)", "예상마진율", "비고"];

/** 앱이 사용하는 3개 탭(단가표/매입기록/작업로그)을 없으면 생성하고 헤더를 채운다 */
export async function ensureAllTabs(): Promise<void> {
  await ensureTab(config.google.tabs.prices, PRICES_HEADER);
  await ensureTab(config.google.tabs.intake, INTAKE_HEADER);
  await ensureTab(config.google.tabs.worklog, WORKLOG_HEADER);
}

// 단독 실행 지원: npm run init-sheets
if (require.main === module) {
  ensureAllTabs()
    .then(() => {
      console.log("✅ 탭 초기화 완료 (단가표 / 매입기록 / 작업로그)");
      process.exit(0);
    })
    .catch((e) => {
      console.error("❌ 초기화 실패:", e);
      process.exit(1);
    });
}
