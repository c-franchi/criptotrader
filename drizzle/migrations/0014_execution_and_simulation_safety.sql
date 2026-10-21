-- Additive migration: never rewrite existing positions or infer the asset of legacy simulations.
CREATE TABLE public.execution_submissions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, lock_owner uuid NOT NULL,
 tx_hash text NOT NULL UNIQUE, nonce bigint NOT NULL, intent jsonb NOT NULL,
 receipt jsonb, checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
ALTER TABLE public.execution_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_submissions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.execution_submissions TO service_role;
CREATE INDEX execution_submissions_pending_idx ON public.execution_submissions(created_at) WHERE finished_at IS NULL;
CREATE INDEX execution_submissions_owner_idx ON public.execution_submissions(lock_owner);
ALTER TABLE public.orders ADD COLUMN gas_bnb numeric, ADD COLUMN actual_token_delta text,
 ADD COLUMN actual_bnb_received numeric, ADD COLUMN accounting_status text NOT NULL DEFAULT 'estimado';
ALTER TABLE public.sim_accounts ADD COLUMN token text, ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.sim_trades ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX sim_trade_request_idx ON public.sim_trades(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX sim_account_active_token_idx ON public.sim_accounts(user_id,lower(token)) WHERE NOT archived AND token IS NOT NULL;
CREATE INDEX orders_user_created_idx ON public.orders(user_id,created_at DESC);
CREATE INDEX grid_bots_due_idx ON public.grid_bots(last_run_at NULLS FIRST) WHERE armed;
REVOKE INSERT,UPDATE,DELETE ON public.sim_accounts,public.sim_trades FROM authenticated;
REVOKE DELETE ON public.grid_bots FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.strategies FROM authenticated;

CREATE FUNCTION public.complete_execution_submission(p_id uuid,p_order jsonb,p_patch jsonb,p_receipt jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.execution_submissions; b uuid;
BEGIN
 SELECT * INTO s FROM public.execution_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
 IF s.finished_at IS NOT NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=s.user_id AND owner=s.lock_owner) THEN RAISE EXCEPTION 'Execution owner mismatch'; END IF;
 b := (s.intent->>'botId')::uuid;
 IF p_order IS NOT NULL THEN
  INSERT INTO public.orders(user_id,side,status,wallet,pair_address,amount_in,amount_out_min,quoted_out,slippage_pct,deadline,tx_hash,block_number,error,token,source,gas_bnb,actual_token_delta,actual_bnb_received,accounting_status)
  VALUES(s.user_id,p_order->>'side',p_order->>'status',p_order->>'wallet',p_order->>'pair_address',p_order->>'amount_in',p_order->>'amount_out_min',p_order->>'quoted_out',(p_order->>'slippage_pct')::numeric,(p_order->>'deadline')::bigint,s.tx_hash,(p_order->>'block_number')::bigint,p_order->>'error',p_order->>'token',p_order->>'source',(p_order->>'gas_bnb')::numeric,p_order->>'actual_token_delta',(p_order->>'actual_bnb_received')::numeric,p_order->>'accounting_status');
 END IF;
 IF b IS NOT NULL AND p_patch <> '{}'::jsonb THEN
  UPDATE public.grid_bots SET
   strat_state=coalesce(p_patch->'strat_state',strat_state),
   last_level=CASE WHEN p_patch ? 'last_level' THEN (p_patch->>'last_level')::integer ELSE last_level END,
   last_error=p_patch->>'last_error',last_reason=coalesce(p_patch->>'last_reason',last_reason),last_run_at=now()
  WHERE id=b AND user_id=s.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bot not found'; END IF;
 END IF;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(s.user_id,'execution_receipt',jsonb_build_object('hash',s.tx_hash,'intent',s.intent,'receipt',p_receipt,'accounting',p_order));
 UPDATE public.execution_submissions SET finished_at=now(),receipt=p_receipt WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.complete_execution_submission(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_execution_submission(uuid,jsonb,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.apply_sim_trade(p_user uuid,p_account uuid,p_revision integer,p_request uuid,p_token text,p_next jsonb,p_trade jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.sim_accounts;
BEGIN
 SELECT * INTO a FROM public.sim_accounts WHERE id=p_account AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR a.archived OR a.token IS NULL OR lower(a.token)<>lower(p_token) THEN RAISE EXCEPTION 'Invalid simulation account'; END IF;
 IF EXISTS(SELECT 1 FROM public.sim_trades WHERE request_id=p_request AND user_id=p_user) THEN RETURN; END IF;
 IF a.revision<>p_revision THEN RAISE EXCEPTION 'Simulation changed: reload before repeating'; END IF;
 IF (p_next->>'quote')::numeric<0 OR (p_next->>'tokens')::numeric<0 OR (p_next->>'costBasis')::numeric<0 THEN RAISE EXCEPTION 'Negative simulated balance'; END IF;
 UPDATE public.sim_accounts SET quote_balance=(p_next->>'quote')::numeric,token_balance=(p_next->>'tokens')::numeric,cost_basis=(p_next->>'costBasis')::numeric,realized_pnl=(p_next->>'realized')::numeric,fees_paid=(p_next->>'fees')::numeric,revision=revision+1 WHERE id=a.id;
 INSERT INTO public.sim_trades(user_id,account_id,side,price,quote_amount,token_amount,fee,gas_estimate,slippage_pct,realized_pnl,reason,pair_address,request_id)
 VALUES(p_user,a.id,p_trade->>'side',(p_trade->>'price')::numeric,(p_trade->>'quote_amount')::numeric,(p_trade->>'token_amount')::numeric,(p_trade->>'fee')::numeric,(p_trade->>'gas_estimate')::numeric,(p_trade->>'slippage_pct')::numeric,(p_trade->>'realized_pnl')::numeric,'manual',p_trade->>'pair_address',p_request);
END $$;
REVOKE ALL ON FUNCTION public.apply_sim_trade(uuid,uuid,integer,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sim_trade(uuid,uuid,integer,uuid,text,jsonb,jsonb) TO service_role;

-- Runtime fields are server-owned even when a user owns the row.
CREATE FUNCTION public.protect_bot_runtime() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF TG_OP='DELETE' THEN
   IF OLD.armed OR coalesce((OLD.strat_state->>'tokens')::numeric,0)>0 OR EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=OLD.user_id) THEN RAISE EXCEPTION 'Cannot delete active execution'; END IF;
   RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.strat_state<>'{}'::jsonb OR NEW.last_level IS NOT NULL OR NEW.last_run_at IS NOT NULL THEN RAISE EXCEPTION 'Runtime is server owned'; END IF;
  ELSIF ROW(NEW.user_id,NEW.token,NEW.strat_state,NEW.last_level,NEW.last_price,NEW.last_run_at,NEW.last_error,NEW.last_reason) IS DISTINCT FROM ROW(OLD.user_id,OLD.token,OLD.strat_state,OLD.last_level,OLD.last_price,OLD.last_run_at,OLD.last_error,OLD.last_reason) THEN RAISE EXCEPTION 'Runtime is server owned'; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.mode,NEW.lower_price,NEW.upper_price,NEW.levels) IS DISTINCT FROM ROW(OLD.mode,OLD.lower_price,OLD.upper_price,OLD.levels) THEN NEW.last_level:=NULL; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_bot_runtime BEFORE INSERT OR UPDATE OR DELETE ON public.grid_bots FOR EACH ROW EXECUTE FUNCTION public.protect_bot_runtime();

CREATE FUNCTION public.guard_strategy_values() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c jsonb:=NEW.config;
BEGIN
 IF (c->>'buyAmount')::numeric<0 OR (c->>'maxSlippagePct')::numeric<0 OR (c->>'maxSlippagePct')::numeric>20 OR (c->>'maxPriceImpactPct')::numeric<0 OR (c->>'maxPriceImpactPct')::numeric>20 OR (c->>'buyTaxPct')::numeric<0 OR (c->>'buyTaxPct')::numeric>=100 OR (c->>'sellTaxPct')::numeric<0 OR (c->>'sellTaxPct')::numeric>=100 OR (c->>'gasReserveBnb')::numeric<0 THEN RAISE EXCEPTION 'Invalid strategy limits'; END IF;
 IF c->>'sizingMode'='percentual' AND (c->>'buyAmount')::numeric>100 THEN RAISE EXCEPTION 'Invalid percentage'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_strategy_values BEFORE INSERT OR UPDATE OF config ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.guard_strategy_values();
-- Execution journal and simulated fills are append-only to clients; existing rows remain intact.
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.protect_order_accounting() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF NEW.source<>'manual' THEN RAISE EXCEPTION 'Robot orders are server owned'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.actual_token_delta IS NOT NULL OR NEW.actual_bnb_received IS NOT NULL OR NEW.gas_bnb IS NOT NULL OR NEW.accounting_status<>'estimado' OR NEW.status<>'preparada' THEN RAISE EXCEPTION 'Accounting is server owned'; END IF;
  ELSIF OLD.source<>'manual' OR NEW.user_id<>OLD.user_id OR ROW(NEW.token,NEW.wallet,NEW.amount_in,NEW.side,NEW.source,NEW.actual_token_delta,NEW.actual_bnb_received,NEW.gas_bnb,NEW.accounting_status,NEW.block_number) IS DISTINCT FROM ROW(OLD.token,OLD.wallet,OLD.amount_in,OLD.side,OLD.source,OLD.actual_token_delta,OLD.actual_bnb_received,OLD.gas_bnb,OLD.accounting_status,OLD.block_number) OR NEW.status='confirmada' THEN RAISE EXCEPTION 'Accounting is server owned'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_order_accounting BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.protect_order_accounting();

ALTER TABLE public.notifications ADD COLUMN push_sent_at timestamptz, ADD COLUMN push_claimed_at timestamptz, ADD COLUMN push_attempts integer NOT NULL DEFAULT 0;
-- Existing notifications must not be resent after this deployment.
UPDATE public.notifications SET push_sent_at=created_at;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(read) ON public.notifications TO authenticated;
CREATE INDEX notifications_push_pending_idx ON public.notifications(created_at) WHERE push_sent_at IS NULL;
CREATE FUNCTION public.record_alert_transition(p_id uuid,p_previous text,p_next text,p_price numeric,p_checked timestamptz,p_title text,p_body text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.price_alerts;
BEGIN
 SELECT * INTO a FROM public.price_alerts WHERE id=p_id AND enabled FOR UPDATE;
 IF NOT FOUND OR a.last_state<>p_previous OR (a.last_checked_at IS NOT NULL AND a.last_checked_at>=p_checked) THEN RETURN false; END IF;
 UPDATE public.price_alerts SET last_state=p_next,last_price=p_price,last_checked_at=p_checked WHERE id=p_id;
 IF p_title IS NOT NULL THEN INSERT INTO public.notifications(user_id,title,body,link) VALUES(a.user_id,p_title,p_body,'/alertas'); END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_alert_transition(uuid,text,text,numeric,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_alert_transition(uuid,text,text,numeric,timestamptz,text,text) TO service_role;
NOTIFY pgrst,'reload schema';

-- A client cannot backdate a withdrawal address to bypass the 24-hour quarantine.
CREATE FUNCTION public.guard_saved_wallet_age() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF TG_OP='INSERT' THEN NEW.created_at:=now();
  ELSIF ROW(NEW.user_id,NEW.address,NEW.created_at) IS DISTINCT FROM ROW(OLD.user_id,OLD.address,OLD.created_at) THEN RAISE EXCEPTION 'Only the wallet label may be edited'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_saved_wallet_age BEFORE INSERT OR UPDATE ON public.user_wallets FOR EACH ROW EXECUTE FUNCTION public.guard_saved_wallet_age();
CREATE FUNCTION public.guard_audit_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND NEW.action IN ('robot_decision','robot_signal','execution_receipt','execution_lock_reconciled','bot_withdraw','wallet_saved') THEN RAISE EXCEPTION 'Execution evidence is server owned'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_audit_source BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.guard_audit_source();
ALTER TABLE public.grid_bots ADD CONSTRAINT grid_bot_bounds CHECK (mode IN ('estrategia','grade') AND levels BETWEEN 2 AND 100 AND max_slippage_pct BETWEEN 0 AND 20 AND max_impact_pct BETWEEN 0 AND 20 AND gas_reserve_bnb>=0 AND order_bnb>=0 AND (mode<>'grade' OR (lower_price>0 AND upper_price>lower_price AND order_bnb>0))) NOT VALID;
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.save_user_strategy(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_version integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_version integer; old_token text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT version,token INTO old_version,old_token FROM public.strategies WHERE user_id=p_user AND lower(token)=lower(p_token) FOR UPDATE;
 IF coalesce(old_version,0)<>p_version THEN RAISE EXCEPTION 'Strategy changed'; END IF;
 INSERT INTO public.strategies(user_id,token,config,tracked_wallet,version,updated_at) VALUES(p_user,coalesce(old_token,p_token),p_config,p_wallet,p_version+1,now())
 ON CONFLICT(user_id,token) DO UPDATE SET config=EXCLUDED.config,tracked_wallet=EXCLUDED.tracked_wallet,version=EXCLUDED.version,updated_at=now();
 UPDATE public.strategies SET tracked_wallet=p_wallet WHERE user_id=p_user AND tracked_wallet IS DISTINCT FROM p_wallet;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'estrategia_salva',jsonb_build_object('token',p_token,'version',p_version+1,'config',p_config));
END $$;
REVOKE ALL ON FUNCTION public.save_user_strategy(uuid,text,jsonb,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_strategy(uuid,text,jsonb,text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
