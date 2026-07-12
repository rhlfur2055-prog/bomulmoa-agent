-- =============================================================
-- 모아장부 Phase 1 — 0001_schema.sql
-- 기획서 §5 스키마 원문을 충실히 반영 (테이블/컬럼명·타입 동일).
-- 수정한 SQL 오류: sellers 전화번호 뒷 4자리 표현식 인덱스는
--   이중 괄호 ((right(phone, 4))) 가 필요하여 고침.
-- 주의: 신분증 사진은 경로(id_photo_path)만 저장 — 이미지 처리/분석 없음.
-- =============================================================

-- 업장 (대림자원 / 모두다자원 / 대성자원)
create table yards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  is_active boolean default true
);

-- 품목 (고철/비철/폐지/기타)
create table items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  unit text default 'kg'
);

-- 품목별 단가 이력 (원/kg, 적용일 기준)
create table item_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id),
  price_krw int not null,
  effective_date date not null default current_date,
  created_by uuid references auth.users(id)
);

-- 판매자 (개인정보 — 신분증 사진은 비공개 스토리지 경로만 저장)
create table sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  id_photo_path text,
  created_at timestamptz default now()
);

-- 재방문 판매자 검색용: 전화번호 뒷 4자리 표현식 인덱스 (이중 괄호 필수)
create index sellers_phone_last4_idx on sellers ((right(phone, 4)));

-- 매입 기록 (장부의 본체)
create table purchases (
  id uuid primary key default gen_random_uuid(),
  yard_id uuid references yards(id) not null,
  seller_id uuid references sellers(id) not null,
  item_id uuid references items(id) not null,
  weight_kg numeric(10,1) not null,
  unit_price int not null,
  total_krw int not null,
  memo text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 신분증 열람 로그 (개인정보 열람 감사 추적 — 열람 시 반드시 기록)
create table id_view_logs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references sellers(id),
  viewed_by uuid references auth.users(id),
  viewed_at timestamptz default now()
);
