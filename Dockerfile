# Bomulmoa 봇 상시 운영용 (Railway/Render/Fly 등에 배포)
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 환경변수(SLACK_*, GOOGLE_*, ANTHROPIC_*)는 배포 플랫폼 시크릿으로 주입
CMD ["node", "dist/index.js"]
