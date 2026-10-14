ALTER TABLE public.orders ADD COLUMN token text NOT NULL DEFAULT '0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA', ADD COLUMN source text NOT NULL DEFAULT 'manual';

CREATE TABLE public.bot_wallets (
  user_id uuid PRIMARY KEY,
  address text NOT NULL,
  enc_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_wallets TO service_role;
ALTER TABLE public.bot_wallets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.grid_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  lower_price numeric NOT NULL,
  upper_price numeric NOT NULL,
  levels integer NOT NULL DEFAULT 10,
  order_bnb numeric NOT NULL,
  max_slippage_pct numeric NOT NULL DEFAULT 2,
  max_impact_pct numeric NOT NULL DEFAULT 3,
  gas_reserve_bnb numeric NOT NULL DEFAULT 0.005,
  armed boolean NOT NULL DEFAULT false,
  last_level integer,
  last_price numeric,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grid_bots TO authenticated;
GRANT ALL ON public.grid_bots TO service_role;
ALTER TABLE public.grid_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON public.grid_bots FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());