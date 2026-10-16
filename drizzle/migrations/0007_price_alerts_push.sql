CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON public.push_devices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_address text NOT NULL CHECK (token_address ~ '^0x[0-9a-fA-F]{40}$'),
  symbol text NOT NULL,
  direction text NOT NULL DEFAULT 'queda' CHECK (direction IN ('queda','alta')),
  base_price numeric NOT NULL CHECK (base_price > 0),
  target_pct numeric NOT NULL CHECK (target_pct > 0 AND target_pct < 1000),
  warn_before_pct numeric NOT NULL DEFAULT 2 CHECK (warn_before_pct >= 0),
  last_state text NOT NULL DEFAULT 'longe',
  last_price numeric,
  last_checked_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON public.price_alerts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.internal_tokens (name) VALUES ('alert_tick') ON CONFLICT DO NOTHING;