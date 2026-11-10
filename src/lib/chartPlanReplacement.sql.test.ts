// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";

let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const scope = "22222222-2222-4222-8222-222222222222";
const bot = "33333333-3333-4333-8333-333333333333";
const token = "0x1111111111111111111111111111111111111111";
const stamp = "2026-11-09T10:00:00Z";
const config = {
  guidedModel: "chart",
  buyAmount: 0.01,
  gasReserveBnb: 0.001,
  maxSlippagePct: 1,
  maxPriceImpactPct: 2,
  chartRule: { id: "new-plan", version: 2 },
};
function historical(name: string, migration: string) {
  const sql = readFileSync(`drizzle/migrations/${migration}`, "utf8")
    .split("\n")
    .map((line) => (line.startsWith("-- ") ? line.slice(3) : line))
    .join("\n");
  const pattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?END \\$\\$;`,
  );
  const match = sql.match(pattern);
  if (!match) throw new Error(`Missing historical SQL ${name}`);
  return match[0];
}
async function replace(
  overrides: {
    owner?: string;
    scope?: string;
    stamp?: string;
    version?: number;
    revision?: number;
    confirmation?: string;
    token?: string;
  } = {},
) {
  return db.query(
    "SELECT public.replace_chart_plan($1,$2,$3,$4::jsonb,$5,$6,'{}'::jsonb,$7,$8::timestamptz,$9,$10::jsonb) AS id",
    [
      overrides.owner ?? owner,
      overrides.scope ?? scope,
      overrides.token ?? token,
      JSON.stringify(config),
      overrides.version ?? 7,
      overrides.revision ?? 0,
      bot,
      overrides.stamp ?? stamp,
      overrides.confirmation ?? "SUBSTITUIR ATIVIDADE",
      JSON.stringify({
        tokens: 12,
        tokensRaw: "12000000000000000000",
        costBnb: 0.02,
        day: "2026-11-09",
        tradesToday: 4,
        lossTodayBnb: 0.003,
        lastFillHash: "old-hash",
      }),
    ],
  );
}
async function rejectedCall(args: Parameters<typeof replace>[0] = {}) {
  await db.exec("SAVEPOINT attempted_replacement");
  let error: unknown;
  try {
    await replace(args);
  } catch (caught) {
    error = caught;
  }
  await db.exec("ROLLBACK TO SAVEPOINT attempted_replacement");
  await db.exec("RESET ROLE");
  expect(error).toBeTruthy();
  const { rows } = await db.query<{ strat_state: { tokens: number }; armed: boolean }>(
    "SELECT strat_state,armed FROM grid_bots WHERE id=$1",
    [bot],
  );
  expect(rows[0]?.strat_state.tokens).toBe(12);
  expect(rows[0]?.armed).toBe(true);
  expect((await db.query("SELECT * FROM audit_log")).rows).toHaveLength(0);
  return String(error);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE grid_bots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,wallet_scope uuid NOT NULL,token text NOT NULL,armed boolean DEFAULT false,archived_at timestamptz,mode text,strat_state jsonb,updated_at timestamptz DEFAULT now(),lower_price numeric,upper_price numeric,levels integer,order_bnb numeric,gas_reserve_bnb numeric,max_slippage_pct numeric,max_impact_pct numeric,last_level integer,last_error text,last_reason text,UNIQUE(user_id,wallet_scope,token));
    CREATE TABLE strategies(user_id uuid,wallet_scope uuid,token text,config jsonb,version integer,tracked_wallet text,updated_at timestamptz DEFAULT now(),UNIQUE(user_id,wallet_scope,token));
    CREATE TABLE strategy_drafts(user_id uuid,wallet_scope uuid,token text,revision integer);
    CREATE TABLE bot_execution_locks(user_id uuid,wallet_scope uuid,owner uuid);
    CREATE TABLE execution_submissions(user_id uuid,wallet_scope uuid,finished_at timestamptz);
    CREATE TABLE orders(user_id uuid,wallet_scope uuid,status text);
    CREATE TABLE audit_log(user_id uuid,action text,details jsonb);
    GRANT USAGE ON SCHEMA public TO service_role,authenticated,anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  for (const name of [
    "guard_bot_strategy_edit",
    "guard_grid_configuration",
    "save_user_strategy_scoped",
    "apply_strategy_with_draft_scoped",
  ])
    await db.exec(historical(name, "0016_multiple_wallet_bots.sql"));
  await db.exec(historical("configure_guided_bot", "0020_guided_bot_setup.sql"));
  await db.exec(
    `CREATE TRIGGER guard_strategy BEFORE UPDATE ON strategies FOR EACH ROW EXECUTE FUNCTION guard_bot_strategy_edit(); CREATE TRIGGER guard_grid BEFORE UPDATE ON grid_bots FOR EACH ROW EXECUTE FUNCTION guard_grid_configuration();`,
  );
  await db.exec(readFileSync("ops/replace-chart-plan.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("BEGIN");
  await db.query(
    "INSERT INTO grid_bots(id,user_id,wallet_scope,token,armed,archived_at,strat_state,updated_at) VALUES($1,$2,$3,$4,true,NULL,$5::jsonb,$6::timestamptz)",
    [
      bot,
      owner,
      scope,
      token,
      JSON.stringify({
        tokens: 12,
        tokensRaw: "12000000000000000000",
        costBnb: 0.02,
        day: "2026-11-09",
        tradesToday: 4,
        lossTodayBnb: 0.003,
        lastFillHash: "old-hash",
      }),
      stamp,
    ],
  );
  await db.query(
    "INSERT INTO strategies(user_id,wallet_scope,token,version,config) VALUES($1,$2,$3,7,'{}')",
    [owner, scope, token],
  );
});
afterEach(async () => {
  await db.exec("ROLLBACK");
});
afterAll(async () => {
  await db?.close();
});

it("archives the full old position, pauses and starts only a new accounting boundary, preserving daily counters", async () => {
  await db.exec("SET LOCAL ROLE service_role");
  const result = await replace();
  expect(result.rows[0]).toEqual({ id: bot });
  const { rows } = await db.query<{ armed: boolean; strat_state: Record<string, unknown> }>(
    "SELECT armed,strat_state FROM grid_bots WHERE id=$1",
    [bot],
  );
  expect(rows[0]?.armed).toBe(false);
  expect(rows[0]?.strat_state).toMatchObject({
    tokens: 0,
    costBnb: 0,
    entries: 0,
    day: "2026-11-09",
    tradesToday: 4,
    lossTodayBnb: 0.003,
    retainedPosition: { count: 1, tokensAtReplacement: 12, costBnbAtReplacement: 0.02 },
  });
  expect(rows[0]?.strat_state["activityStartedAt"]).toBeTruthy();
  const archived = await db.query<{
    details: {
      previous_bot: { strat_state: { tokens: number; lastFillHash: string } };
      tokens_sold: boolean;
      started: boolean;
    };
  }>("SELECT details FROM audit_log WHERE action='chart_plan_replaced'");
  expect(archived.rows[0]?.details.previous_bot.strat_state).toMatchObject({
    tokens: 12,
    lastFillHash: "old-hash",
  });
  expect(archived.rows[0]?.details.tokens_sold).toBe(false);
  expect(archived.rows[0]?.details.started).toBe(false);
});
it("works for a removed bot with a retained position", async () => {
  await db.query("UPDATE grid_bots SET armed=false,archived_at=now() WHERE id=$1", [bot]);
  await replace();
  expect(
    (
      await db.query<{ armed: boolean; archived_at: string | null }>(
        "SELECT armed,archived_at FROM grid_bots WHERE id=$1",
        [bot],
      )
    ).rows[0],
  ).toEqual({ armed: false, archived_at: null });
});
it("replaces a paused bot without touching historical orders or its retained evidence", async () => {
  await db.query("UPDATE grid_bots SET armed=false WHERE id=$1", [bot]);
  await db.query("INSERT INTO orders VALUES($1,$2,'confirmada')", [owner, scope]);
  await db.query("INSERT INTO audit_log VALUES($1,'previous_receipt','{\"hash\":\"previous\"}')", [owner]);
  await replace();
  expect((await db.query("SELECT status FROM orders")).rows).toEqual([{ status: "confirmada" }]);
  expect((await db.query("SELECT details FROM audit_log WHERE action='previous_receipt'")).rows).toEqual([{ details: { hash: "previous" } }]);
  const result = await db.query<{ armed: boolean; strat_state: { tokens: number; retainedPosition: { tokensAtReplacement: number } } }>("SELECT armed,strat_state FROM grid_bots");
  expect(result.rows[0]?.armed).toBe(false);
  expect(result.rows[0]?.strat_state.tokens).toBe(0);
  expect(result.rows[0]?.strat_state.retainedPosition.tokensAtReplacement).toBe(12);
});
it("rejects a different token even with a valid owner and wallet", async () => {
  expect(await rejectedCall({ token: "0x2222222222222222222222222222222222222222" })).toContain("não encontrada");
});
it("rolls back the complete old bot, strategy, draft and audit after a late failure", async () => {
  await db.query("INSERT INTO strategy_drafts VALUES($1,$2,$3,0)", [owner, scope, token]);
  await db.exec(`CREATE FUNCTION reject_final_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='guided_bot_saved' THEN RAISE EXCEPTION 'isolated late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER late_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_final_audit();`);
  const before = await db.query("SELECT to_jsonb(b) AS bot FROM grid_bots b");
  await rejectedCall();
  expect((await db.query("SELECT to_jsonb(b) AS bot FROM grid_bots b")).rows).toEqual(before.rows);
  expect((await db.query("SELECT version,config FROM strategies")).rows).toEqual([{ version: 7, config: {} }]);
  expect((await db.query("SELECT revision FROM strategy_drafts")).rows).toEqual([{ revision: 0 }]);
});
it.each(["mutex", "submission", "legacy-order"])(
  "refuses replacement during %s without changing the old state",
  async (kind) => {
    if (kind === "mutex")
      await db.query("INSERT INTO bot_execution_locks VALUES($1,$2,gen_random_uuid())", [
        owner,
        scope,
      ]);
    if (kind === "submission")
      await db.query("INSERT INTO execution_submissions VALUES($1,$2,NULL)", [owner, scope]);
    if (kind === "legacy-order")
      await db.query("INSERT INTO orders VALUES($1,$2,'enviada')", [owner, scope]);
    expect(await rejectedCall()).toContain("Operação pendente");
  },
);
it.each(["owner", "scope", "stamp", "version", "revision", "confirmation"])(
  "rejects stale/foreign/missing %s and rolls back the whole operation",
  async (field) => {
    const values = {
      owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      scope: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stamp: "2026-11-08T10:00:00Z",
      version: 6,
      revision: 1,
      confirmation: "",
    };
    await rejectedCall({ [field]: values[field as keyof typeof values] });
  },
);
it("does not expose the replacement RPC to ordinary users", async () => {
  for (const role of ["anon", "authenticated"]) {
    const result = await db.query<{ allowed: boolean }>(
      "SELECT has_function_privilege($1,'public.replace_chart_plan(uuid,uuid,text,jsonb,integer,integer,jsonb,uuid,timestamptz,text,jsonb)','EXECUTE') AS allowed",
      [role],
    );
    expect(result.rows[0]?.allowed).toBe(false);
    await db.exec(`SET LOCAL ROLE ${role}`);
    expect(await rejectedCall()).toContain("permission denied");
    await db.exec("RESET ROLE");
  }
});

it("rejects a changed fill even if the bot timestamp was not updated", async () => {
  await db.query(
    "UPDATE grid_bots SET strat_state=jsonb_set(strat_state,'{costBnb}','0.03') WHERE id=$1",
    [bot],
  );
  expect(await rejectedCall()).toContain("estado mudou");
  const row = await db.query<{ strat_state: { costBnb: number } }>(
    "SELECT strat_state FROM grid_bots WHERE id=$1",
    [bot],
  );
  expect(row.rows[0]?.strat_state.costBnb).toBe(0.03);
});
