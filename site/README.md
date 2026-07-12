# 보물모아 사이트 운영 가이드

정적 HTML 사이트입니다. 빌드 과정 없음 — 파일 고치고 올리면 끝.

## ① 실데이터 입력 (최초 1회, 필수)

`site/data.js` 를 열어 **★ 표시 항목**을 채우세요.

- 지점명 · 실주소 · 실전화번호 (placeholder 번호에 "0000"이 들어있으면 검색용 JSON-LD가 자동 제외됩니다 → 실번호 입력해야 검색 노출)
- `lat`, `lng` 좌표: 네이버지도에서 지점 검색 → URL의 좌표 확인
- `kakaoChannelUrl`: 카카오톡 채널 링크 (비워두면 카톡 버튼 자동 숨김)

## ② 단가 갱신

단가는 `site/prices.js` 에 있고, 구글시트 단가표에서 자동 생성됩니다.

1. 구글시트 **단가표 탭**에서 매입단가 수정 (기존 운영 방식 그대로)
2. 저장소에서 `npm run export-prices` 실행 → `site/prices.js` 재생성
3. 사이트 재배포 (아래 ③)

급하면 `prices.js` 를 직접 고쳐도 되지만, 다음 `export-prices` 실행 때 시트 내용으로 덮어써집니다. `price: null` 인 품목은 사이트에 "전화 문의"로 표시됩니다.

## ③ 배포

정적 파일 3종 + assets 폴더가 전부입니다. 아무 데나 올리면 됩니다.

- **Netlify**: `site/` 폴더 드래그&드롭
- **GitHub Pages**: 저장소 설정에서 `site/` 를 퍼블리시 디렉토리로
- **기존 서버 nginx**: `site/` 내용을 웹루트로 복사 (`rsync -av site/ 서버:/var/www/bomulmoa/`)

## ④ 네이버 플레이스 (검색 유입의 핵심)

3개 지점 모두 [네이버 스마트플레이스](https://smartplace.naver.com)에 등록하고,
발급된 플레이스 링크를 `data.js` 의 `naverPlaceUrl` 에 붙여넣으세요.
지점 카드에 [네이버 지도] 버튼이 자동으로 생깁니다.

---

## 🚀 bomulmoa.com 실서비스 반영 (Treasure-Collective 이식)

라이브 bomulmoa.com 은 이 레포가 아니라 **`rhlfur2055-prog/Treasure-Collective` 레포에서 Cloudflare Workers로 배포**된다 (main 푸시 → GitHub Actions 자동배포). 이 폴더의 새 사이트를 반영하려면:

1. Treasure-Collective 레포에 이 폴더의 파일 복사:
   `index.html`, `style.css`, `data.js`, `prices.js` (+ 재사용하는 `assets/hero.mp4`, `assets/hero-poster.jpg`)
2. `data.js` 의 ★ 항목(실전화·실주소·좌표·네이버플레이스) 입력 — 거점: 대림자원(부평)·모두다자원(인천)·대성자원(부천)
3. main 에 푸시 → 자동배포. 단, **GitHub Secrets 에 `CLOUDFLARE_API_TOKEN` 등록이 완료됐는지 먼저 확인** (7/5 기준 미등록 상태였음)
4. 단가 갱신 루틴: 이 레포에서 `npm run export-prices` 로 생성한 `prices.js` 를 Treasure-Collective 에 복사·푸시
   (Treasure-Collective 워커에 `/api/prices` 가 있다면, 추후 prices.js 대신 그 API를 읽도록 개선 가능)

> Claude 세션에서 자동 이식하려면 세션의 GitHub 접근 범위에 `Treasure-Collective` 레포를 추가해야 한다.
