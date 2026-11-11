import { expect, it, vi } from "vitest";
import { readSaleLimits } from "./manualSale.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function client(manual: unknown, strategy: unknown) {
  const eq = vi.fn();
  const from = vi.fn((table: string) => {
    const q = { select: () => q, eq: (...args: unknown[]) => { eq(...args); return q; }, ilike: () => q,
      maybeSingle: async () => ({ data: table === "manual_sale_limits" ? manual : table === "user_wallets" ? {id:"scope"} : {config:strategy}, error:null }) };
    return q;
  });
  return { db: {from} as unknown as SupabaseClient<Database>, eq, from };
}
it("reads explicit zero from the matching strategy when no manual overrides exist", async () => {
  const {db,eq} = client(null, {maxPriceImpactPct:0,maxSlippagePct:7});
  expect(await readSaleLimits(db,"owner","scope","token")).toEqual({source:"strategy",limits:{maxPriceImpactPct:0,maxSlippagePct:7}});
  expect(eq).toHaveBeenCalledWith("user_id","owner"); expect(eq).toHaveBeenCalledWith("wallet_scope","scope");
});
it("missing strategy limits remain undefined instead of importing a default", async () => {
  const {db} = client(null, {maxSlippagePct:7});
  expect((await readSaleLimits(db,"owner","scope","token")).limits).toBeNull();
});
it("reads the saved manual override on reload without reading robot configuration", async () => {
  const {db,from} = client({max_price_impact_pct:1,max_slippage_pct:2},{maxPriceImpactPct:0,maxSlippagePct:7});
  expect(await readSaleLimits(db,"owner","scope","token")).toEqual({source:"manual",limits:{maxPriceImpactPct:1,maxSlippagePct:2}});
  expect(from).not.toHaveBeenCalledWith("strategies");
});