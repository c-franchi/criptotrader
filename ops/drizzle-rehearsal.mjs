import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertIsolated, migrations, reconcile, verifyLedger } from './drizzle-reconcile.mjs';

const url = 'postgres://postgres@127.0.0.1:55432/cryptobot_rehearsal';
assertIsolated(url);
const db = postgres(url, { ssl: false, max: 1, onnotice: () => {} });
const entries = migrations();
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS', name); }
try {
  await db.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);`);
  for (const e of entries.slice(0, 22)) {
    await db.begin(async tx => { await tx.unsafe(e.sql); if (e.idx <= 14) await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${e.hash},${e.when})`; });
  }
  const catalog = await db.unsafe(readFileSync('ops/drizzle-catalog.sql','utf8'));
  writeFileSync('/tmp/cryptobot-pg/expected-catalog.json', JSON.stringify(catalog,null,2));
  await check('seven legitimate missing entries reconciled', async () => assert.equal((await reconcile(db,catalog,entries)).length,7));
  await check('reconciliation is idempotent', async () => assert.equal((await reconcile(db,catalog,entries)).length,0));
  await check('only 0022 and 0023 remain pending', async () => {
    const [latest] = await db.unsafe('SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1');
    assert.deepEqual(entries.filter(e => e.when > Number(latest.created_at)).map(e => e.idx),[22,23]);
  });
  await check('schema divergence aborts without recording history', async () => {
    await db.unsafe('ALTER TABLE public.bot_wallets ADD COLUMN rehearsal_drift text');
    await assert.rejects(reconcile(db,catalog,entries),/Catalog divergence/);
    assert.equal((await db.unsafe('SELECT count(*) AS n FROM drizzle.__drizzle_migrations'))[0].n,'22');
    await db.unsafe('ALTER TABLE public.bot_wallets DROP COLUMN rehearsal_drift');
  });
  await check('wrong hash aborts even when timestamp matches', async () => {
    const rows=await db.unsafe('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at');
    assert.throws(()=>verifyLedger(rows.map((r,i)=> i===15?{...r,hash:'invalid'}:r),entries),/Ledger divergence/);
  });
  for (const e of entries.slice(22)) {
    await db.begin(async tx => { await tx.unsafe(e.sql); await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${e.hash},${e.when})`; });
    console.log('PASS installed',e.tag);
  }
  await db.begin(async tx => {
    await tx.unsafe(readFileSync('tests/accounting-release-isolated.sql','utf8'));
  });
  checks.push('0022/0023 actual role, trigger, queue and candle tests');
  await check('pending migrations replay is idempotent',async()=>{
    for(const e of entries.slice(22)) await db.unsafe(e.sql);
    assert.equal((await db.unsafe('SELECT count(*) AS n FROM drizzle.__drizzle_migrations'))[0].n,'24');
  });
  writeFileSync('/tmp/cryptobot-pg/rehearsal-result.json',JSON.stringify({checks,postgres:'17.11',drizzleOrm:'0.45.4',productionChanged:false},null,2));
} finally { await db.end(); }