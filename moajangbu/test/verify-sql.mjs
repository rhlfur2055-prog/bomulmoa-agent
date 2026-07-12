// =============================================================
// 모아장부 Phase 1 — SQL 로컬 검증 하네스
//
// @electric-sql/pglite(WASM Postgres) 로 네트워크/데몬 없이
// 마이그레이션 + RLS + seed 를 실제로 실행해 검증한다.
//
// Supabase 에 실제로 존재하는 auth.uid()/auth.jwt() 를
// 로컬 전용 스텁(current_setting 기반)으로 흉내낸다.
// 스텁은 이 테스트 안에서만 쓰이며 실제 배포 SQL 에는 포함되지 않는다.
//
// 실행: npm run verify:sql
// =============================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sqlFile = (p) => readFile(path.join(ROOT, "supabase", p), "utf8");

// ---------- 테스트 결과 집계 ----------
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
  if (!ok) failed += 1;
}

const db = new PGlite();

// ---------- (a) Supabase auth 스텁 ----------
// - auth.users: FK 대상 테이블 스텁
// - auth.uid()/auth.jwt(): GUC(app.uid / app.jwt) 를 읽는 스텁
// - authenticated/anon 롤: Supabase 에는 기본 존재하므로 여기서 미리 생성
//   (0002 가 `to authenticated` 정책과 `revoke ... from anon` 으로 참조)
// - default privileges: Supabase 는 새 테이블에 anon/authenticated 권한을
//   자동 부여한다. 이를 흉내내야 0002 의 명시 revoke 가 실제로 anon 권한을
//   걷어내는지 검증할 수 있다.
await db.exec(`
  create schema auth;

  create table auth.users (id uuid primary key);

  create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;

  create function auth.jwt() returns jsonb
  language sql stable
  as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;

  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema public to anon, authenticated;

  alter default privileges in schema public grant all on tables to anon, authenticated;
`);

// ---------- (b) 마이그레이션 + seed 실행 ----------
await db.exec(await sqlFile(path.join("migrations", "0001_schema.sql")));
await db.exec(await sqlFile(path.join("migrations", "0002_rls.sql")));
await db.exec(await sqlFile("seed.sql"));

// ---------- (c) seed 건수 검증 ----------
const count = async (table) =>
  Number((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n);

check("seed: yards = 3", (await count("yards")) === 3);
check("seed: items = 16", (await count("items")) === 16);
check("seed: item_prices = 16", (await count("item_prices")) === 16);

// ---------- (d) RLS 동작 검증 준비 ----------
// authenticated 롤에 스키마/테이블 권한 부여
// (실제 Supabase 도 authenticated 에 기본 grant 가 걸려 있다)
await db.exec(`
  grant usage on schema public to authenticated;
  grant usage on schema auth to authenticated;
  grant all privileges on all tables in schema public to authenticated;
`);

// 테스트 사용자 2명 (관리자 1, 대림자원 직원 1)
const ADMIN_UID = "00000000-0000-0000-0000-00000000000a";
const STAFF_UID = "00000000-0000-0000-0000-00000000000b";
await db.query(`insert into auth.users (id) values ($1), ($2)`, [ADMIN_UID, STAFF_UID]);

// seed 데이터에서 필요한 id 조회
const yardId = async (name) =>
  (await db.query(`select id from yards where name = $1`, [name])).rows[0].id;
const DAELIM = await yardId("대림자원");   // 직원 소속 업장
const DAESEONG = await yardId("대성자원"); // 타 업장
const ITEM = (await db.query(`select id from items where name = '생철'`)).rows[0].id;

// JWT/uid GUC 를 바꿔가며 사용자를 흉내낸다
async function actAs(uid, role, yard_id = null) {
  const jwt = JSON.stringify({ app_metadata: yard_id ? { role, yard_id } : { role } });
  await db.query(`select set_config('app.uid', $1, false), set_config('app.jwt', $2, false)`, [uid, jwt]);
}

// 이후 모든 쿼리는 authenticated 롤(RLS 적용 대상)로 실행
await db.exec(`set role authenticated`);

// [준비] 직원이 판매자 1명 등록 (매입 FK 용 — sellers insert 정책도 함께 통과해야 함)
await actAs(STAFF_UID, "staff", DAELIM);
let SELLER;
try {
  SELLER = (
    await db.query(
      `insert into sellers (name, phone) values ('홍길동', '010-1234-5678') returning id`
    )
  ).rows[0].id;
} catch (e) {
  check("준비: 직원의 판매자 등록", false, e.message);
  process.exit(1);
}

const insertPurchase = (yard, createdBy) =>
  db.query(
    `insert into purchases (yard_id, seller_id, item_id, weight_kg, unit_price, total_krw, created_by)
     values ($1, $2, $3, 120.0, 230, 27600, $4)`,
    [yard, SELLER, ITEM, createdBy]
  );

// ---------- RLS 테스트 ----------

// 1) 직원(대림자원): 소속 업장 매입 기록 → 성공해야 함
try {
  await insertPurchase(DAELIM, STAFF_UID);
  check("직원: 소속 업장(대림자원) 매입 insert 허용", true);
} catch (e) {
  check("직원: 소속 업장(대림자원) 매입 insert 허용", false, e.message);
}

// 2) 직원(대림자원): 타 업장(대성자원) 매입 기록 → RLS 위반으로 실패해야 함
try {
  await insertPurchase(DAESEONG, STAFF_UID);
  check("직원: 타 업장(대성자원) 매입 insert 차단", false, "insert 가 성공해버림");
} catch {
  check("직원: 타 업장(대성자원) 매입 insert 차단", true);
}

// [준비] 관리자가 대성자원 매입 1건 기록 (직원 select 필터링 검증용)
await actAs(ADMIN_UID, "admin");
try {
  await insertPurchase(DAESEONG, ADMIN_UID);
} catch (e) {
  check("준비: 관리자의 대성자원 매입 insert", false, e.message);
  process.exit(1);
}

// 3) 직원: 매입 select 시 소속 업장 것만 보여야 함 (전체 2건 중 1건)
await actAs(STAFF_UID, "staff", DAELIM);
{
  const rows = (await db.query(`select yard_id from purchases`)).rows;
  check(
    "직원: 매입 select 는 소속 업장만 (1건, 대림자원)",
    rows.length === 1 && rows[0].yard_id === DAELIM,
    `${rows.length}건 조회됨`
  );
}

// 4) 직원: 단가 update → 정책 없음 → 0행 갱신이어야 함
{
  const res = await db.query(`update item_prices set price_krw = price_krw + 1`);
  check("직원: item_prices update 차단 (0행)", res.affectedRows === 0, `${res.affectedRows}행 갱신됨`);
}

// 5) 관리자: 매입 전체 select → 2건 보여야 함
await actAs(ADMIN_UID, "admin");
{
  const rows = (await db.query(`select yard_id from purchases`)).rows;
  check("관리자: 매입 전체 select (2건)", rows.length === 2, `${rows.length}건 조회됨`);
}

// 6) 관리자: 단가 update → 전 행(16) 갱신되어야 함
{
  const res = await db.query(`update item_prices set price_krw = price_krw + 0`);
  check("관리자: item_prices update 허용 (16행)", res.affectedRows === 16, `${res.affectedRows}행 갱신됨`);
}

// 7) 관리자: 매입 memo 정정 허용 — update 정책의 WITH CHECK 가 정상 통과하는지
{
  const res = await db.query(`update purchases set memo = '정정 테스트'`);
  check("관리자: 매입 memo 정정 허용 (2행)", res.affectedRows === 2, `${res.affectedRows}행 갱신됨`);
}

// 8) 관리자라도 created_by 바꿔치기는 불변 트리거가 차단해야 함 (감사 추적)
try {
  await db.query(`update purchases set created_by = $1`, [ADMIN_UID]);
  check("감사 추적: purchases.created_by 변경 차단 (트리거)", false, "update 가 성공해버림");
} catch {
  check("감사 추적: purchases.created_by 변경 차단 (트리거)", true);
}

// 9) 형식 오류 yard_id 클레임 → 캐스트 에러 없이 0건 (fail-closed)
await actAs(STAFF_UID, "staff", "not-a-uuid");
try {
  const rows = (await db.query(`select id from purchases`)).rows;
  check(
    "직원: 형식 오류 yard_id 클레임 → 에러 없이 0건 (fail-closed)",
    rows.length === 0,
    `${rows.length}건 조회됨`
  );
} catch (e) {
  check("직원: 형식 오류 yard_id 클레임 → 에러 없이 0건 (fail-closed)", false, e.message);
}

// 10) anon 롤: 0002 의 명시 revoke 로 테이블 접근 자체가 거부되어야 함
//     (revoke 가 없으면 스텁의 default privileges 때문에 select 가 성공한다)
await db.exec(`set role anon`);
try {
  await db.query(`select * from sellers`);
  check("anon: sellers 접근 차단 (명시 revoke)", false, "select 가 성공해버림");
} catch {
  check("anon: sellers 접근 차단 (명시 revoke)", true);
}
await db.exec(`reset role; set role authenticated`);

// ---------- 결과 ----------
console.log(failed === 0 ? "\n모든 테스트 통과" : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
