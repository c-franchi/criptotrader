CREATE TABLE public.manual_sale_limits (user_id uuid NOT NULL, wallet_scope uuid NOT NULL, token text NOT NULL CHECK(token ~ '^0x[0-9a-f]{40}$'), max_price_impact_pct numeric NOT NULL CHECK(max_price_impact_pct BETWEEN 0 AND 20), max_slippage_pct numeric NOT NULL CHECK(max_slippage_pct BETWEEN 0 AND 20), PRIMARY KEY(user_id,wallet_scope,token));
GRANT SELECT,INSERT,UPDATE ON public.manual_sale_limits TO authenticated;
GRANT ALL ON public.manual_sale_limits TO service_role;
ALTER TABLE public.manual_sale_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_manual_limits ON public.manual_sale_limits FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());