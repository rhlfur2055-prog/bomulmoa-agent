# Bomulmoa 에이전트 앱 🪙

**고물상 키오스크 스타트업 'Bomulmoa'** 팀(오도경·임동근·임혁진)을 위한 Slack 업무 비서.
구글 스프레드시트를 백엔드로 쓰며, 매입 기록·단가 조회/수정·팀 작업량 체크·AI 자연어 처리를 지원합니다.

- **스택**: Node.js + TypeScript · [Slack Bolt](https://slack.dev/bolt-js) (Socket Mode) · Google Sheets API · Anthropic Claude
- **실행**: 로컬 PC (Socket Mode라 공개 URL 불필요)

---

## ✨ 기능

| 슬래시 명령 (영문/한글) | 설명 |
|------------|------|
| `/price` `/단가` [품목] | 매입/판매 단가 조회 |
| `/buy` `/매입` 고객 품목 무게 | 매입 1건 기록 (지급액 자동 계산) |
| `/log` `/작업` 내용 시간 | 내 오늘 작업 로그 기록 (하루 목표 1h) |
| `/today` `/오늘` | 오늘 팀원별 작업량 + 매입 현황 요약 |
| `/grants` `/지원사업` [검색어] | 창업·중소기업 지원사업 공고 조회 (기업마당·K-Startup·구글뉴스 수집분, 마감 임박순) |
| `/help` `/도움` | 명령어 도움말 |
| `@봇멘션` / DM | **AI 자연어 + 웹검색** — "구리 시세 검색해줘", "임동근 조사 1시간", "오늘 누가 일했어?" 등 |
| (자동) | 단가표가 바뀌면 지정 채널에 **실시간 알림** |
| (자동) | 서버 cron이 지원사업 공고를 매일 수집해 시트에 쌓고, **마감 임박(D-14) 공고를 Slack 알림** |

시트 탭 3개(`단가표`, `매입기록`, `작업로그`)는 앱 시작 시 없으면 자동 생성됩니다.

---

## 🚀 설치 & 실행

### 1. 의존성 설치
```bash
cd bomulmoa-agent
npm install
```

### 2. 구글 서비스 계정 만들기 (시트 접근용)
1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성
2. **Google Sheets API** 사용 설정
3. **사용자 인증 정보 → 서비스 계정 만들기** → 키(JSON) 생성 → 다운로드
4. 받은 JSON을 `service-account.json` 으로 이 폴더에 저장
5. JSON 안의 `client_email` (예: `bomulmoa@...iam.gserviceaccount.com`) 를 복사해
   **대상 스프레드시트를 그 이메일에 '편집자'로 공유**

### 3. Slack 앱 만들기 (매니페스트로 1분 완성)
1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From a manifest**
2. 워크스페이스 선택 → **[slack-manifest.yml](slack-manifest.yml)** 내용을 붙여넣기 (명령·스코프·이벤트·Socket Mode 자동 설정)
3. **Basic Information → App-Level Tokens** → Generate (scope `connections:write`) → `SLACK_APP_TOKEN` (`xapp-...`)
4. **Install to Workspace** → Bot User OAuth Token → `SLACK_BOT_TOKEN` (`xoxb-...`)
5. **Basic Information → Signing Secret** → `SLACK_SIGNING_SECRET`

> 슬래시 명령은 안전하게 영문(`/price` `/buy` `/log` `/today` `/help`)으로 등록됩니다.
> 한글이 편하면 멘션/DM으로 자연어("구리 단가 검색해줘")를 쓰면 AI 에이전트가 처리해요.

### 4. 환경변수 설정
```bash
cp .env.example .env
# .env 를 열어 토큰/키/팀원 정보 채우기
```
팀원 `TEAM_MEMBERS`는 `Slack사용자ID:이름:역할` 형식 (쉼표 구분).
Slack 사용자 ID는 각자 프로필 → 더보기 → **"멤버 ID 복사"**.

### 5. 실행
```bash
npm run dev      # 개발(자동 재시작)
# 또는
npm run build && npm start
```
`⚡ Bomulmoa 에이전트 실행 중` 이 뜨면 Slack에서 `/today` 나 봇 멘션으로 테스트하세요.

### 6. 상시 운영 (24시간 자동) — 선택
로컬은 PC를 켜둬야 해서, 상시 운영은 클라우드 배포를 권장합니다:
- **[Dockerfile](Dockerfile)** 포함 → Railway / Render / Fly.io 등에 배포
- 환경변수(`SLACK_*`, `GOOGLE_*`, `ANTHROPIC_*`)는 플랫폼 시크릿으로 주입
  (`GOOGLE_SERVICE_ACCOUNT_KEY` 에 서비스계정 JSON 전체를 넣으면 파일 없이 동작)

---

## 🗂️ 구조
```
src/
  config.ts          환경변수 + 팀원 파싱
  index.ts           Slack Bolt 진입점 (명령/이벤트 핸들러)
  format.ts          금액 포맷 유틸
  watcher.ts         단가 변경 폴링 → 실시간 알림
  agent/agent.ts     Claude tool-use 자연어 에이전트
  sheets/
    client.ts        Google Sheets 인증 + 읽기/쓰기 헬퍼
    prices.ts        단가 조회/수정
    intake.ts        매입 기록
    worklog.ts       작업 로그 + 일일 집계
  scripts/initSheets.ts  탭/헤더 자동 생성
```

## 🔐 보안
- `service-account.json`, `.env` 는 `.gitignore`에 포함 — **절대 커밋 금지**
- 서비스 계정은 이 스프레드시트 하나에만 공유해 최소 권한 유지
