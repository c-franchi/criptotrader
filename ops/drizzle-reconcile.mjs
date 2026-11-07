/** Offline operator tool. Production execution is intentionally unavailable.
 * Ledger timestamps are journal identities, NOT dates claimed as execution time.
 * No import of this file belongs in the app's Worker bundle.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

export function migrations(root = 'drizzle/migrations') {
  const journal = JSON.parse(readFileSync(`${root}/meta/_journal.json`, 'utf8'));
  return journal.entries.map((e, i, all) => {
    if (e.idx !== i || !Number.isSafeInteger(e.when) || (i > 0 && e.when <= all[i - 1].when)) throw new Error('Invalid journal ordering');
    const sql = readFileSync(`${root}/${e.tag}.sql`, 'utf8');
    return { ...e, sql, hash: createHash('sha256').update(sql).digest('hex') };
  });
}

export function verifyLedger(rows, entries, through = 21) {
  const sorted = [...rows].sort((a, b) => Number(a.created_at) - Number(b.created_at));
  if (sorted.length < 15 || sorted.length > through + 1) throw new Error('Unexpected ledger length');
  sorted.forEach((row, i) => {
    if (Number(row.created_at) !== entries[i].when || row.hash !== entries[i].hash) throw new Error(`Ledger divergence at ${i}`);
  });
  return entries.slice(sorted.length, through + 1);
}

export function compareCatalog(expected, actual) {
  const left = new Map(expected.map(o => [o.object_key, o]));
  const right = new Map(actual.map(o => [o.object_key, o]));
  const differences = [...new Set([...left.keys(), ...right.keys()])].filter(k => !isDeepStrictEqual(left.get(k)?.definition, right.get(k)?.definition));
  if (differences.length) throw new Error(`Catalog divergence: ${differences.join(', ')}`);
}

export function assertIsolated(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '55432' || !parsed.pathname.startsWith('/cryptobot_rehearsal')) throw new Error('Only disposable localhost rehearsal databases are allowed');
}

export async function reconcile(db, expectedCatalog, entries = migrations()) {
  return db.begin('isolation level serializable', async tx => {
    const [target] = await tx.unsafe('SELECT current_database() AS name, inet_server_addr()::text AS host, inet_server_port() AS port');
    if (!target.name.startsWith('cryptobot_rehearsal') || target.host !== '127.0.0.1' || target.port !== 55432) throw new Error('Production reconciliation is disabled: privileged supported execution and recovery gates required');
    await tx.unsafe("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
    await tx.unsafe('LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE');
    await tx.unsafe('LOCK TABLE public.bot_wallets,public.grid_bots,public.orders,public.execution_submissions,public.bot_execution_locks IN SHARE MODE');
    const [state] = await tx.unsafe(`SELECT (SELECT count(*) FROM public.grid_bots WHERE armed) AS armed,
      (SELECT count(*) FROM public.bot_execution_locks) AS locks,
      (SELECT count(*) FROM public.execution_submissions WHERE finished_at IS NULL) AS pending,
      (SELECT count(*) FROM public.orders WHERE status='enviada') AS sent`);
    if (Object.values(state).some(v => Number(v) !== 0)) throw new Error('Active execution: abort');
    compareCatalog(expectedCatalog, await tx.unsafe(readFileSync('ops/drizzle-catalog.sql', 'utf8')));
    const rows = await tx.unsafe('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id');
    const missing = verifyLedger(rows, entries);
    for (const e of missing) await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${e.hash},${e.when})`;
    verifyLedger(await tx.unsafe('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id'), entries);
    return missing.map(e => ({ tag: e.tag, hash: e.hash, journalTimestamp: e.when }));
  });
}