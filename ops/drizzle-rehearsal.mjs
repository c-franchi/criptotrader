import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertIsolated, migrations, reconcile, verifyLedger } from './drizzle-reconcile.mjs';

const url = process.env.REHEARSAL_DATABASE_URL || 'postgres://postgres@127.0.0.1:55432/cryptobot_rehearsal';
assertIsolated(url);
const db = postgres(url, { ssl: false, max: 1, onnotice: () => {} });
const entries = migrations();
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS', name); }
try {
  await db.unsafe(`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE sandbox_exec; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    -- Observed platform ACL baseline, reproduced locally only. Historical revokes
    -- still execute normally; none are suppressed to make comparisons pass.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO sandbox_exec;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
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
  const sale='33333333-3333-3333-3333-333333333333';
  await db.unsafe(`INSERT INTO public.orders(id,user_id,side,status,wallet,amount_in,amount_out_min,quoted_out,slippage_pct,deadline,source)
    VALUES('${sale}','44444444-4444-4444-4444-444444444444','venda','confirmada','0x1111111111111111111111111111111111111111','1','1','1',1,1,'robo')`);
  for (const e of entries.slice(22)) {
    await db.begin(async tx => { await tx.unsafe(e.sql); await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${e.hash},${e.when})`; });
    console.log('PASS installed',e.tag);
  }
  await check('0023 backfills existing sale once without confirming proceeds',async()=>{
    assert.equal((await db.unsafe(`SELECT count(*) AS n FROM public.order_accounting_retry WHERE order_id='${sale}'`))[0].n,'1');
    assert.equal((await db.unsafe(`SELECT actual_bnb_received FROM public.orders WHERE id='${sale}'`))[0].actual_bnb_received,null);
    // Keep historical item leased while the independent role test claims its own sale.
    await db.unsafe(`UPDATE public.order_accounting_retry SET next_attempt_at=now()+interval '1 day' WHERE order_id='${sale}'`);
  });
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