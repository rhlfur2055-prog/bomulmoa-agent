#!/usr/bin/env bash
# serve-site.sh — 보물모아 정적 사이트를 nginx로 직접 서빙 (Vultr 서버용)
#
# Treasure-Collective 레포 접근 불가로, 이 서버(bomulmoa-bot)에서
# repo의 site/ 디렉터리를 nginx가 그대로 서빙한다.
# 매일 08:40 publish-site.sh가 site/를 재생성하므로 서빙 내용은 자동 갱신됨.
#
# 서버(Ubuntu 24.04, root 권한)에서 repo 루트 기준으로 실행:
#     bash deploy/serve-site.sh
# 여러 번 실행해도 안전(idempotent).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$REPO_DIR/site"
LOG_DIR="/var/log/bomulmoa"
NGINX_CONF="/etc/nginx/sites-available/bomulmoa"

# site/ 디렉터리 존재 확인
if [ ! -d "$SITE_DIR" ]; then
  echo "❌ 사이트 디렉터리가 없습니다: $SITE_DIR" >&2
  echo "   먼저 git pull 또는 publish-site.sh 실행으로 site/를 생성하세요." >&2
  exit 1
fi

# 로그 디렉터리 준비
mkdir -p "$LOG_DIR"

# nginx 설치 (이미 설치돼 있으면 건너뜀)
if command -v nginx >/dev/null 2>&1; then
  echo "ℹ️  nginx 이미 설치됨 — 설치 단계 건너뜀"
else
  echo "📦 nginx 설치 중..."
  apt-get update
  apt-get install -y nginx
fi

# nginx 사이트 설정 작성 (재실행 시 덮어씀)
# 주의: 따옴표 없는 heredoc이므로 nginx 변수($uri 등)는 \$ 로 이스케이프한다.
cat > "$NGINX_CONF" <<EOF
# 보물모아 정적 사이트 — deploy/serve-site.sh 가 생성/갱신함 (직접 수정 금지)
server {
    listen 80;
    listen [::]:80;
    server_name bomulmoa.com www.bomulmoa.com _;

    root $SITE_DIR;
    index index.html;
    charset utf-8;

    access_log $LOG_DIR/nginx-access.log;
    error_log  $LOG_DIR/nginx-error.log;

    # 텍스트류 gzip 압축
    gzip on;
    gzip_types text/plain text/css application/javascript application/json application/xml text/xml image/svg+xml;
    gzip_min_length 256;

    # HTML은 캐시하지 않음 (매일 재생성되므로 항상 최신 제공)
    location ~* \.html\$ {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files \$uri =404;
    }

    # 정적 자산은 7일 캐시
    location ~* \.(css|js|json|png|jpg|jpeg|gif|svg|ico|webp|woff2?)\$ {
        expires 7d;
        add_header Cache-Control "public";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

# sites-enabled 심볼릭 링크 (재실행 시에도 안전)
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/bomulmoa

# 기본(default) 사이트가 80 포트를 가로채지 않도록 제거
if [ -e /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
  echo "ℹ️  기본 nginx default 사이트 비활성화"
fi

# 설정 검증 후 적용
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo ""
echo "✅ nginx 서빙 설정 완료"
echo "   문서 루트 : $SITE_DIR"
echo "   설정 파일 : $NGINX_CONF"
echo "   로그      : $LOG_DIR/nginx-access.log / nginx-error.log"
echo ""
echo "다음 단계:"
echo "  1) 로컬 확인 :  curl -I http://localhost/   → HTTP 200 이면 정상"
echo "  2) 외부 확인 :  브라우저에서 http://158.247.244.88/ 접속"
echo "  3) 도메인 연결 : Cloudflare에서 bomulmoa.com A 레코드를 이 서버 IP로 변경"
echo "     (Workers 라우트 제거 필수! 자세한 절차는 docs/도메인배포.md 참조)"
