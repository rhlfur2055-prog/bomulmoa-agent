-- =============================================================
-- 모아장부 Phase 1 — 0002_rls.sql
-- RLS(행 수준 보안) 정책.
-- 직원→업장 매핑은 별도 테이블 없이 Supabase JWT app_metadata 로 구현:
--   role: 'admin' | 'staff',  yard_id: 소속 업장 uuid
-- (기획서의 "추가 테이블 금지" 원칙 준수)
-- =============================================================

-- ---------- JWT 클레임 헬퍼 함수 ----------

-- 현재 사용자 역할('admin'/'staff', 미설정 시 '') — JWT app_metadata.role
create or replace function public.app_role()
returns text
language sql
stable
security invoker
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

-- 현재 사용자 소속 업장 uuid (미설정 시 null) — JWT app_metadata.yard_id
create or replace function public.app_yard_id()
returns uuid
language sql
stable
security invoker
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'yard_id', '')::uuid
$$;

-- ---------- 전 테이블 RLS 활성화 ----------

alter table yards enable row level security;
alter table items enable row level security;
alter table item_prices enable row level security;
alter table sellers enable row level security;
alter table purchases enable row level security;
alter table id_view_logs enable row level security;

-- ---------- yards ----------

-- 업장 목록은 로그인한 누구나 조회 (매입 화면 업장 선택용)
create policy yards_select on yards
  for select to authenticated
  using (true);

-- 업장 추가는 관리자만
create policy yards_insert on yards
  for insert to authenticated
  with check (app_role() = 'admin');

-- 업장 수정은 관리자만
create policy yards_update on yards
  for update to authenticated
  using (app_role() = 'admin');

-- 업장 삭제는 관리자만
create policy yards_delete on yards
  for delete to authenticated
  using (app_role() = 'admin');

-- ---------- items ----------

-- 품목 목록은 로그인한 누구나 조회
create policy items_select on items
  for select to authenticated
  using (true);

-- 품목 추가는 관리자만
create policy items_insert on items
  for insert to authenticated
  with check (app_role() = 'admin');

-- 품목 수정은 관리자만
create policy items_update on items
  for update to authenticated
  using (app_role() = 'admin');

-- 품목 삭제는 관리자만
create policy items_delete on items
  for delete to authenticated
  using (app_role() = 'admin');

-- ---------- item_prices ----------

-- 단가는 로그인한 누구나 조회 (매입 시 자동 계산용)
create policy item_prices_select on item_prices
  for select to authenticated
  using (true);

-- 단가 등록은 관리자만 + 등록자 본인 기록 강제
create policy item_prices_insert on item_prices
  for insert to authenticated
  with check (app_role() = 'admin' and created_by = auth.uid());

-- 단가 수정은 관리자만
create policy item_prices_update on item_prices
  for update to authenticated
  using (app_role() = 'admin');

-- 단가 삭제는 관리자만
create policy item_prices_delete on item_prices
  for delete to authenticated
  using (app_role() = 'admin');

-- ---------- sellers ----------

-- 판매자 조회는 전 업장 공유 (재방문 판매자 검색 대응)
create policy sellers_select on sellers
  for select to authenticated
  using (true);

-- 판매자 등록은 직원/관리자 (매입 접수 시 신규 판매자 등록)
create policy sellers_insert on sellers
  for insert to authenticated
  with check (app_role() in ('staff', 'admin'));

-- 판매자 정보 수정은 관리자만 (개인정보 보호)
create policy sellers_update on sellers
  for update to authenticated
  using (app_role() = 'admin');

-- 판매자 삭제는 관리자만
create policy sellers_delete on sellers
  for delete to authenticated
  using (app_role() = 'admin');

-- ---------- purchases ----------

-- 매입 기록: 직원은 소속 업장만, 관리자는 전체 + 기록자 본인 강제
create policy purchases_insert on purchases
  for insert to authenticated
  with check (
    (
      app_role() = 'admin'
      or (app_role() = 'staff' and yard_id = app_yard_id())
    )
    and created_by = auth.uid()
  );

-- 매입 조회: 직원은 소속 업장만, 관리자는 전체
create policy purchases_select on purchases
  for select to authenticated
  using (
    app_role() = 'admin'
    or (app_role() = 'staff' and yard_id = app_yard_id())
  );

-- 장부 정정(수정)은 관리자만 — 컴플라이언스(증빙 데이터 무결성)
create policy purchases_update on purchases
  for update to authenticated
  using (app_role() = 'admin');

-- 장부 삭제는 관리자만 — 컴플라이언스
create policy purchases_delete on purchases
  for delete to authenticated
  using (app_role() = 'admin');

-- ---------- id_view_logs ----------

-- 열람 로그 기록: 로그인 사용자 누구나 + 열람자 본인 기록 강제
create policy id_view_logs_insert on id_view_logs
  for insert to authenticated
  with check (viewed_by = auth.uid());

-- 열람 로그 조회는 관리자만 (감사 용도)
create policy id_view_logs_select on id_view_logs
  for select to authenticated
  using (app_role() = 'admin');
