# CI/CD 자동 리서치 파이프라인 ⚙️

**GitHub Actions**가 정해진 주기(기본 6시간)마다 자동으로 실행 →
고물상 **시세 + 뉴스**를 긁어 구글 시트에 정리합니다. PC를 켜둘 필요 없이 **클라우드에서 상시 자동**.

```
GitHub Actions (cron)  →  npm run research  →  구글 시트
                          · 시세 스크래핑        · 시세조사 탭
                          · 뉴스 RSS 수집        · 뉴스 탭 (중복제거)
                          · Claude 브리핑(선택)  · 리서치브리핑 탭
```

---

## 설정 순서

### 1. GitHub 저장소에 코드 올리기
```bash
cd bomulmoa-agent
git init && git add . && git commit -m "init: bomulmoa research bot"
# GitHub에 새 repo 만든 뒤
git remote add origin https://github.com/<본인>/bomulmoa-agent.git
git push -u origin main
```
> `.env`, `service-account.json` 은 `.gitignore` 로 제외됨 — 절대 커밋되지 않음 ✅

### 2. 구글 서비스 계정 준비 (시트 쓰기 권한)
1. [Google Cloud Console](https://console.cloud.google.com/) → **Google Sheets API** 사용 설정
2. **서비스 계정 만들기** → 키(JSON) 생성 → 다운로드
3. JSON 안 `client_email` 을 복사해 **대상 시트를 '편집자'로 공유**
   (시트: `1YaAZFnkjTaVmptDlc9HBZT2tkmzvircjsWw8tVB_rKM`)

### 3. GitHub Secrets 등록
저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| Secret 이름 | 값 |
|-------------|-----|
| `GOOGLE_SHEET_ID` | `1YaAZFnkjTaVmptDlc9HBZT2tkmzvircjsWw8tVB_rKM` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 서비스 계정 JSON **파일 전체 내용**을 그대로 붙여넣기 |
| `ANTHROPIC_API_KEY` | (선택) Claude 브리핑 쓸 때만. 없으면 시세·뉴스만 수집 |

### 4. 동작 확인
- 저장소 **Actions** 탭 → **Bomulmoa 리서치** → **Run workflow** (수동 실행)
- 성공하면 구글 시트에 `시세조사`·`뉴스`(·`리서치브리핑`) 탭이 생기고 데이터가 쌓임
- 이후엔 6시간마다 자동 실행

---

## 주기 변경
[.github/workflows/research.yml](.github/workflows/research.yml) 의 cron 수정:
```yaml
- cron: "0 */6 * * *"   # 6시간마다 (UTC)
# 예) 매일 오전 9시(KST=UTC+9 → 0시): "0 0 * * *"
# 예) 2시간마다:                      "0 */2 * * *"
```

## 로컬에서 먼저 테스트하려면
```bash
# .env 에 GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY_FILE(=./service-account.json) 설정 후
npm run research          # 1회 실행
npm run research:watch    # 로컬에서 6시간마다 (PC 켜둬야 함)
```

## 수집되는 것
| 탭 | 내용 | 소스 |
|----|------|------|
| `시세조사` | 품목별 매입시세(원/kg) 이력 | gomulprice.com |
| `뉴스` | 고물상/고철/재활용 뉴스 (중복 제거) | Google News RSS |
| `리서치브리핑` | 시장흐름·매입가 조정 제안·주요뉴스 요약 | Claude (선택) |

---

## 🖥️ 서버 자동 실행 (cron)

정기 실행은 Vultr 서버에서 cron으로 돈다. repo 루트에 `.env`(SLACK_*, GOOGLE_*, 선택 `BIZINFO_API_KEY`/`DATA_GO_KR_KEY`)를 두고 한 번만 설치하면 된다:

```bash
git pull                     # 최신 코드
npm install                  # 의존성
bash deploy/setup-cron.sh    # cron 설치 (idempotent — 여러 번 실행해도 안전)
```

설치되는 작업(시간은 KST):

| 스크립트 | 주기 | 하는 일 |
|---|---|---|
| `crawl-grants.ts` | 매일 08:00 | 기업마당·K-Startup·구글뉴스에서 지원사업 수집 → `지원사업` 시트 + 마감임박 Slack |
| `watch-grants.ts` | 매일 09:00 | 예비창업 신규 공고 감시 알림 |
| `watch-modoo.ts` | 2시간마다 | 「모두의 창업」 2차 공고 감시 |
| `npm run research` | 6시간마다 | 시세·뉴스 리서치 |
| `deploy/publish-site.sh` | 매일 08:40 | 시세·소식 글 생성 → `TREASURE_DIR` 설정 시 Treasure-Collective 푸시 → Cloudflare 자동배포 |

사이트 완전 자동 발행이 되려면 세 가지가 갖춰져야 한다: ① 서버에 **push 권한 있는 Treasure-Collective clone**이 있어야 하고, ② 그 경로를 `TREASURE_DIR` 환경변수(기본 `$HOME/Treasure-Collective`)로 지정해야 하며, ③ Treasure-Collective 레포의 GitHub Secrets 에 `CLOUDFLARE_API_TOKEN` 이 등록돼 있어야 main 푸시 시 Cloudflare Workers 자동배포가 완료된다. 셋 중 하나라도 없으면 `publish-site.sh` 는 사이트 파일만 로컬에 생성하고 안내 메시지를 남긴다.

로그는 `/var/log/bomulmoa/*.log`. Slack에서 `/지원사업` 으로 수집분을 언제든 조회할 수 있다.
