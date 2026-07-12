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

-- 현재 사용자 소속 업장 uuid — JWT app_metadata.yard_id
-- 미설정/빈값/형식 오류 모두 null 반환(fail-closed).
-- 형식 검증 없이 바로 ::uuid 캐스트하면 잘못된 클레임이 정책 평가 중
-- 런타임 에러를 일으키므로, uuid 형식일 때만 캐스트한다.
create or replace function public.app_yard_id()
returns uuid
language sql
stable
security invoker
as $$
  select case
    when (auth.jwt() -> 'app_metadata' ->> 'yard_id')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() -> 'app_metadata' ->> 'yard_id')::uuid
    else null
  end
$$;

-- ---------- 전 테이블 RLS 활성화 ----------

alter table yards enable row level security;
alter table items enable row level security;
alter table item_prices enable row level security;
alter table sellers enable row level security;
alter table purchases enable row level security;
alter table id_view_logs enable row level security;

-- ---------- 방어적 권한 정리 (defense-in-depth) ----------
-- Supabase 는 기본 GRANT 로 anon/authenticated 에 테이블 권한을 부여한다.
-- 아래 정책들이 전부 `to authenticated` 라 RLS 가 켜져 있는 한 anon 은 어차피
-- 차단되지만, RLS 가 (실수로) 꺼지는 사고까지 대비해 anon 권한을 명시적으로
-- 회수한다 — 특히 sellers 는 개인정보 테이블이다.
revoke all on yards, items, item_prices, sellers, purchases, id_view_logs from anon;

-- authenticated 에 필요한 권한을 명시 (Supabase 기본 grant 와 동일 범위를 자체 문서화)
grant select, insert, update, delete
  on yards, items, item_prices, sellers, purchases, id_view_logs
  to authenticated;

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
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

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
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

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

-- 단가 수정은 관리자만 (created_by 변경은 아래 불변 트리거가 추가로 차단)
create policy item_prices_update on item_prices
  for update to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

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
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

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
-- (기록자 created_by 변경은 아래 불변 트리거가 추가로 차단)
create policy purchases_update on purchases
  for update to authenticated
  using (app_role() = 'admin')
  with check (app_role() = 'admin');

-- 장부 삭제는 관리자만 — 컴플라이언스
create policy purchases_delete on purchases
  for delete to authenticated
  using (app_role() = 'admin');

-- ---------- 감사 추적 보호: created_by 불변 트리거 ----------
-- insert 정책은 created_by = auth.uid() 를 강제하지만, update 정책의
-- WITH CHECK(app_role()='admin') 만으로는 관리자가 나중에 기록자
-- (created_by)를 다른 사용자로 바꿔치기하는 것을 막지 못한다.
-- 증빙 데이터 무결성을 위해 purchases/item_prices 의 created_by 를 불변으로 고정.
-- (service_role 은 RLS 는 우회해도 트리거는 우회하지 못한다.)
create or replace function public.forbid_created_by_change()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by 는 수정할 수 없습니다 (감사 추적 보호)';
  end if;
  return new;
end;
$$;

create trigger purchases_created_by_immutable
  before update on purchases
  for each row execute function public.forbid_created_by_change();

create trigger item_prices_created_by_immutable
  before update on item_prices
  for each row execute function public.forbid_created_by_change();

-- ---------- id_view_logs ----------

-- 열람 로그 기록: 로그인 사용자 누구나 + 열람자 본인 기록 강제
create policy id_view_logs_insert on id_view_logs
  for insert to authenticated
  with check (viewed_by = auth.uid());

-- 열람 로그 조회는 관리자만 (감사 용도)
create policy id_view_logs_select on id_view_logs
  for select to authenticated
  using (app_role() = 'admin');

-- ---------- 신분증 사진(id-photos 버킷) 접근 통제 — Phase 1 상태 ----------
-- 기획서 요구: id_photo 열람은 "관리자 전용 + 열람 로그 강제".
-- Phase 1 에서는 storage.objects 정책을 만들지 않는다. id-photos 버킷은
-- 비공개(private) + 정책 0개 상태라 클라이언트의 직접 접근이 전부
-- 거부된다(fail-closed). "관리자 전용 signed URL 발급 + 발급 시마다
-- id_view_logs 강제 기록"은 Phase 2 서버 코드에서 구현한다 (README §4).
-- 참고: sellers.id_photo_path 는 스토리지 경로 문자열일 뿐 이미지가 아니며,
-- 실제 이미지 접근은 위 통제를 따른다.
