#!/usr/bin/env bash
# publish-site.sh — 보물모아 사이트 자동 발행 (시세·소식 갱신 → Treasure-Collective 푸시)
#
# 흐름:
#   1) 구글시트 단가표 → site/prices.js 재생성  (export-site-prices.ts)
#   2) 소식 글 → site/posts.js 재생성           (export-site-posts.ts)
#   3) TREASURE_DIR(기본: $HOME/Treasure-Collective)가 git repo면
#      배포 파일을 복사 → commit → push  (main 푸시 → Cloudflare Workers 자동배포)
#
# 서버 cron에서 매일 실행되며, 여러 번 실행해도 안전(idempotent).
# 인증정보(.env)가 없으면 생성 단계는 경고만 남기고 기존 파일로 계속 진행한다.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TREASURE_DIR="${TREASURE_DIR:-$HOME/Treasure-Collective}"

cd "$REPO_DIR"

# ── 1) 시세(prices.js) 생성 — 실패해도 계속 (구글 인증정보가 없을 수 있음) ──
if npx tsx src/scripts/export-site-prices.ts; then
  echo "✅ site/prices.js 갱신 완료"
else
  echo "⚠️  시세 생성 실패 — 기존 site/prices.js 로 계속 진행 (.env의 GOOGLE_* 설정 확인)"
fi

# ── 2) 소식(posts.js) 생성 — 동일하게 실패 허용 ──
if npx tsx src/scripts/export-site-posts.ts; then
  echo "✅ site/posts.js 갱신 완료"
else
  echo "⚠️  소식 글 생성 실패 — 기존 site/posts.js 로 계속 진행"
fi

# ── 3) Treasure-Collective 이식 + 푸시 ──
if [ ! -d "$TREASURE_DIR/.git" ]; then
  echo ""
  echo "ℹ️  TREASURE_DIR($TREASURE_DIR)가 없거나 git repo가 아닙니다."
  echo "   사이트 파일은 로컬(site/)에 생성 완료. 완전 자동 발행을 원하면:"
  echo "   1) 서버에 push 권한 있는 Treasure-Collective clone을 두고"
  echo "   2) TREASURE_DIR 환경변수로 그 경로를 지정하세요."
  echo "   (Treasure-Collective main 푸시 → Cloudflare Workers 자동배포)"
  exit 0
fi

# 배포 대상 파일만 복사 — posts/sample-* 와 site/README.md 는 제외
for f in index.html style.css data.js prices.js posts.js; do
  if [ -f "site/$f" ]; then
    cp "site/$f" "$TREASURE_DIR/$f"
  else
    echo "⚠️  site/$f 없음 — 건너뜀"
  fi
done
for d in posts assets; do
  if [ -d "site/$d" ]; then
    mkdir -p "$TREASURE_DIR/$d"
    # 샘플 파일(sample-*)은 실서비스에 싣지 않는다
    find "site/$d" -maxdepth 1 -type f ! -name 'sample-*' \
      -exec cp {} "$TREASURE_DIR/$d/" \;
  fi
done

cd "$TREASURE_DIR"
# 존재하는 배포 경로만 스테이징 (posts.js/posts 는 아직 없을 수 있음)
for p in index.html style.css data.js prices.js posts.js posts assets; do
  if [ -e "$p" ]; then
    git add "$p"
  fi
done

# 변경 없으면 조용히 종료 (커밋 스킵)
if git diff --cached --quiet; then
  echo "ℹ️  변경 내용 없음 — 커밋/푸시 생략"
  exit 0
fi

git commit -m "사이트 자동 발행 — 시세·소식 갱신 $(date +%F)"

# push 재시도 3회 (일시적 네트워크 오류 대비) — force push 금지
for i in 1 2 3; do
  if git push; then
    echo "✅ Treasure-Collective 푸시 완료 → Cloudflare Workers 자동배포 대기"
    exit 0
  fi
  echo "⚠️  push 실패 ($i/3) — 10초 후 재시도"
  sleep 10
done

echo "❌ push 3회 실패 — 네트워크/인증 확인 필요 (커밋은 로컬에 남아있음)"
exit 1
