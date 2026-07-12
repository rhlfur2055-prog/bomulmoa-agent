#!/usr/bin/env bash
# setup-cron.sh — 보물모아 서버 자동 실행 cron 설치 (지원사업 크롤러 + 공고 감시 + 리서치)
#
# 서버(egress 열린 Vultr 인스턴스)에서 repo 루트 기준으로 1회 실행:
#     bash deploy/setup-cron.sh
# 기존 bomulmoa 블록을 지우고 새로 심으므로 여러 번 실행해도 안전(idempotent).
# .env(SLACK_*, GOOGLE_*, ANTHROPIC_*, 그리고 선택적 BIZINFO_API_KEY/DATA_GO_KR_KEY)가
# repo 루트에 있어야 각 스크립트가 정상 동작한다.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPX="$(command -v npx)"
NPM="$(command -v npm)"
LOG_DIR="/var/log/bomulmoa"

mkdir -p "$LOG_DIR"

TMP="$(mktemp)"
# 기존 bomulmoa 블록 제거 후 현재 crontab 보존
crontab -l 2>/dev/null | sed '/# >>> bomulmoa-cron >>>/,/# <<< bomulmoa-cron <<</d' > "$TMP" || true

cat >> "$TMP" <<EOF
# >>> bomulmoa-cron >>>
CRON_TZ=Asia/Seoul
# 지원사업 통합 크롤러 — 매일 08:00 (기업마당·K-Startup·구글뉴스 → 시트 + 마감임박 Slack)
0 8 * * * cd $REPO_DIR && $NPX tsx src/scripts/crawl-grants.ts >> $LOG_DIR/crawl-grants.log 2>&1
# 예비창업 공고 감시망 — 매일 09:00
0 9 * * * cd $REPO_DIR && $NPX tsx src/scripts/watch-grants.ts >> $LOG_DIR/watch-grants.log 2>&1
# 「모두의 창업」 2차 공고 감시 — 2시간마다
0 */2 * * * cd $REPO_DIR && $NPX tsx src/scripts/watch-modoo.ts >> $LOG_DIR/watch-modoo.log 2>&1
# 시세·뉴스 리서치 — 6시간마다
0 */6 * * * cd $REPO_DIR && $NPM run research >> $LOG_DIR/research.log 2>&1
# 사이트 시세 자동 반영 — 리서치(0시 기준 6시간마다) 20분 뒤 sites/prices.js 갱신
20 */6 * * * cd $REPO_DIR && $NPX tsx src/scripts/export-site-prices.ts >> $LOG_DIR/export-prices.log 2>&1
# 사이트 자동 발행 — 매일 08:40 (시세·소식 생성 → Treasure-Collective 푸시 → Cloudflare 자동배포)
40 8 * * * cd $REPO_DIR && bash deploy/publish-site.sh >> $LOG_DIR/publish-site.log 2>&1
# <<< bomulmoa-cron <<<
EOF

crontab "$TMP"
rm -f "$TMP"

echo "✅ cron 설치 완료"
echo "   repo : $REPO_DIR"
echo "   logs : $LOG_DIR/*.log"
echo "--- 설치된 bomulmoa 항목 ---"
crontab -l | sed -n '/# >>> bomulmoa-cron >>>/,/# <<< bomulmoa-cron <<</p'
