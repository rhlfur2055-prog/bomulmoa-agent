# 모아장부 — Phase 1 데이터 레이어

> **한 줄 정의 (기획서 인용)**: 고물상 업장(대림자원/모두다자원/대성자원)의 매입 기록 전산화 + 2027 예비창업패키지 증빙 데이터.

절대 규칙(기획서): ① 신분증 사진은 **업로드·저장만** — 이미지 처리/분석 코드 금지. ② 명시된 기능 외 추가 구현 금지(필요하면 제안만). ③ 개인정보(신분증)는 비공개 스토리지 + RLS + 열람 로그.

---

## Phase 현황

| Phase | 내용 | 상태 |
|-------|------|------|
| **Phase 1** | 스키마 마이그레이션 + RLS 정책 + seed (이 디렉터리) | ✅ 완료 |
| Phase 2 | Next.js 앱/UI + 신분증 열람 강제 로직(서버) | ⏳ 대기 — **명시 지시 후 착수** |
| Phase 3 | 관리자 화면(단가 관리 등) | ⏳ 대기 — 명시 지시 후 착수 |
| Phase 4~5 | (기획서 후속 단계) | ⏳ 대기 — 명시 지시 후 착수 |

---

## 파일 구성

```
moajangbu/
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql   # 기획서 §5 스키마 (테이블 6개)
│   │   └── 0002_rls.sql      # RLS 정책 + JWT 클레임 헬퍼 함수
│   └── seed.sql              # 업장 3곳 + 품목 16종 + 오늘자 예시 단가
├── test/
│   └── verify-sql.mjs        # pglite(WASM Postgres) 로컬 검증 하네스
├── package.json
└── README.md
```

---

## 실제 Supabase 프로젝트 적용 절차

기획서 §7 Phase 1 규칙에 따라 **아래 명령어를 먼저 확인(승인)한 뒤** 순서대로 실행한다.

### 1. Supabase CLI 설치 & 로그인

```bash
# macOS
brew install supabase/tap/supabase
# 또는 npm
npm install -g supabase

supabase login
```

### 2. 프로젝트 연결 & 마이그레이션 적용

```bash
cd moajangbu
supabase init                          # supabase/config.toml 생성 (기존 migrations/ 유지)
supabase link --project-ref XXX        # XXX = Supabase 대시보드의 프로젝트 ref
supabase db push                       # 0001_schema.sql → 0002_rls.sql 순서로 적용
```

### 3. seed 적용

```bash
# 방법 A: psql 직접 (연결 문자열은 대시보드 → Settings → Database)
psql "$SUPABASE_DB_URL" -f supabase/seed.sql

# 방법 B: supabase CLI
supabase db execute --file supabase/seed.sql
```

> ⚠️ `seed.sql` 의 단가는 **예시 단가**다. 실전 투입 전 관리자 화면(Phase 3) 또는 SQL 로 실단가 수정 필수. 또한 단순 insert 라 **신규 DB에 1회만** 적용할 것.

### 4. Storage 비공개 버킷 `id-photos` 생성

대시보드 경로: **Storage → New bucket → 이름 `id-photos` → Public bucket 체크 해제(비공개)** → Create.

- 신분증 사진은 이 버킷에 **업로드/저장만** 한다 (이미지 처리/분석 금지).
- 접근은 **관리자 전용 signed URL** 발급 + 발급 시마다 `id_view_logs` 에 열람 기록.
- 이 "signed URL + 열람 로그" 강제는 **Phase 2 서버 코드에서 구현**된다. Phase 1 시점에는 버킷을 비공개로만 유지하면 된다.

### 5. 직원 계정 생성 & app_metadata 설정

직원→업장 매핑은 별도 테이블 없이 JWT `app_metadata` 로 구현한다 (기획서의 추가 테이블 금지 원칙).
대시보드에서 계정 생성(Authentication → Users → Add user) 후, SQL Editor 에서:

```sql
-- 직원 (yard uuid 는 select id, name from yards; 로 확인)
update auth.users
set raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object('role', 'staff', 'yard_id', '<yard uuid>')
where email = 'staff@example.com';

-- 관리자
update auth.users
set raw_app_meta_data = raw_app_meta_data
  || jsonb_build_object('role', 'admin')
where email = 'admin@example.com';
```

> app_metadata 변경 후에는 해당 사용자가 **재로그인(토큰 재발급)** 해야 새 클레임이 적용된다.

---

## 로컬 검증 (Supabase 없이)

pglite(WASM Postgres) 로 마이그레이션·RLS·seed 를 실제 실행해 검증한다. 네트워크/데몬 불필요.

```bash
cd moajangbu
npm install
npm run verify:sql
```

검증 항목: seed 건수(yards 3 / items 16 / item_prices 16), 직원의 소속 업장 매입 기록 허용·타 업장 차단·조회 필터링, 직원의 단가 수정 차단, 관리자의 전체 조회·단가 수정 허용.

---

## Phase 2 착수 선행조건

기획서 **§9 (부모님 확인 4문항)** 의 답을 받는 것이 **Phase 2 UI 착수의 선행조건**이다.
답을 받기 전에는 Phase 2 를 시작하지 않는다.
