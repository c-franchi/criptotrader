-- Saved-wallet scopes isolate execution; the zero UUID preserves every legacy account.
REVOKE ALL ON public.bot_wallets,public.bot_execution_locks,public.execution_submissions,public.strategy_drafts FROM PUBLIC,anon,authenticated;
ALTER TABLE public.bot_wallets ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.grid_bots ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.strategies ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.strategy_drafts ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.bot_execution_locks ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.execution_submissions ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.orders ADD COLUMN wallet_scope uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.bot_wallets DROP CONSTRAINT bot_wallets_pkey, ADD PRIMARY KEY(user_id,wallet_scope);
ALTER TABLE public.bot_execution_locks DROP CONSTRAINT bot_execution_locks_pkey, ADD PRIMARY KEY(user_id,wallet_scope);
CREATE UNIQUE INDEX bot_execution_owner_unique ON public.bot_execution_locks(owner);
CREATE UNIQUE INDEX bot_wallet_address_unique ON public.bot_wallets(lower(address));
ALTER TABLE public.grid_bots DROP CONSTRAINT grid_bots_user_id_token_key, ADD UNIQUE(user_id,wallet_scope,token);
ALTER TABLE public.strategies DROP CONSTRAINT strategies_user_token_key, ADD UNIQUE(user_id,wallet_scope,token);
ALTER TABLE public.strategy_drafts DROP CONSTRAINT strategy_drafts_pkey, ADD PRIMARY KEY(user_id,wallet_scope,token);
CREATE UNIQUE INDEX grid_scope_token_lower_idx ON public.grid_bots(user_id,wallet_scope,lower(token));
CREATE UNIQUE INDEX strategy_scope_token_lower_idx ON public.strategies(user_id,wallet_scope,lower(token));
CREATE INDEX orders_scope_created_idx ON public.orders(user_id,wallet_scope,created_at DESC);
CREATE INDEX execution_scope_pending_idx ON public.execution_submissions(user_id,wallet_scope) WHERE finished_at IS NULL;

CREATE FUNCTION public.validate_execution_scope() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.user_id,NEW.wallet_scope) IS DISTINCT FROM ROW(OLD.user_id,OLD.wallet_scope) THEN RAISE EXCEPTION 'Wallet scope is immutable'; END IF;
 IF NEW.wallet_scope<>'00000000-0000-0000-0000-000000000000' THEN
  -- Serialize creation against removal of the saved wallet identity.
  PERFORM id FROM public.user_wallets WHERE id=NEW.wallet_scope AND user_id=NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet does not belong to user'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_execution_scope BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();
CREATE TRIGGER validate_execution_scope BEFORE UPDATE ON public.execution_submissions FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();
CREATE TRIGGER validate_execution_scope BEFORE INSERT OR UPDATE ON public.bot_wallets FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();
CREATE TRIGGER validate_execution_scope BEFORE INSERT OR UPDATE ON public.grid_bots FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();
CREATE TRIGGER validate_execution_scope BEFORE INSERT OR UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();
CREATE TRIGGER validate_execution_scope BEFORE INSERT OR UPDATE ON public.strategy_drafts FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();
CREATE TRIGGER validate_execution_scope BEFORE INSERT OR UPDATE ON public.bot_execution_locks FOR EACH ROW EXECUTE FUNCTION public.validate_execution_scope();

CREATE FUNCTION public.preserve_execution_wallet() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bot_wallets WHERE user_id=OLD.user_id AND wallet_scope=OLD.id)
 OR EXISTS(SELECT 1 FROM public.grid_bots WHERE user_id=OLD.user_id AND wallet_scope=OLD.id)
 OR EXISTS(SELECT 1 FROM public.strategies WHERE user_id=OLD.user_id AND wallet_scope=OLD.id)
 OR EXISTS(SELECT 1 FROM public.strategy_drafts WHERE user_id=OLD.user_id AND wallet_scope=OLD.id)
 THEN RAISE EXCEPTION 'Esta carteira tem robôs ou estratégias vinculados e deve ser preservada'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER preserve_execution_wallet BEFORE DELETE ON public.user_wallets FOR EACH ROW EXECUTE FUNCTION public.preserve_execution_wallet();
REVOKE ALL ON FUNCTION public.preserve_execution_wallet() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.serialize_bot_wallet_changes() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':'||NEW.wallet_scope::text,0)); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.guard_bot_strategy_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':'||NEW.wallet_scope::text, 0));
IF EXISTS (SELECT 1 FROM public.bot_execution_locks WHERE user_id = NEW.user_id AND wallet_scope = NEW.wallet_scope) THEN RAISE EXCEPTION 'Execution in progress: wait for reconciliation before editing strategy'; END IF;
IF TG_OP = 'UPDATE' AND NEW.config IS DISTINCT FROM OLD.config AND EXISTS (SELECT 1 FROM public.grid_bots WHERE user_id = NEW.user_id AND wallet_scope = NEW.wallet_scope AND lower(token) = lower(NEW.token) AND coalesce((strat_state->>'tokens')::numeric,0) > 0) THEN RAISE EXCEPTION 'Open position: preserve cycle configuration'; END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_grid_configuration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed boolean;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':'||NEW.wallet_scope::text, 0));
IF TG_OP = 'INSERT' THEN changed := true; ELSE
changed := ROW(NEW.mode,NEW.token,NEW.lower_price,NEW.upper_price,NEW.levels,NEW.order_bnb,NEW.max_slippage_pct,NEW.max_impact_pct,NEW.gas_reserve_bnb) IS DISTINCT FROM ROW(OLD.mode,OLD.token,OLD.lower_price,OLD.upper_price,OLD.levels,OLD.order_bnb,OLD.max_slippage_pct,OLD.max_impact_pct,OLD.gas_reserve_bnb);
IF changed AND coalesce((OLD.strat_state->>'tokens')::numeric,0) > 0 THEN RAISE EXCEPTION 'Open position: preserve cycle configuration'; END IF;
END IF;
IF (changed OR (TG_OP = 'UPDATE' AND NEW.armed AND NOT OLD.armed)) AND EXISTS (SELECT 1 FROM public.bot_execution_locks WHERE user_id = NEW.user_id AND wallet_scope = NEW.wallet_scope) THEN RAISE EXCEPTION 'Wallet execution pending: configuration locked'; END IF;
RETURN NEW;
END $$;

CREATE FUNCTION public.save_user_strategy_scoped(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_version integer,p_scope uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_version integer; old_token text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT version,token INTO old_version,old_token FROM public.strategies WHERE user_id=p_user AND wallet_scope=p_scope AND lower(token)=lower(p_token) FOR UPDATE;
 IF coalesce(old_version,0)<>p_version THEN RAISE EXCEPTION 'Strategy changed'; END IF;
 INSERT INTO public.strategies(user_id,wallet_scope,token,config,tracked_wallet,version,updated_at) VALUES(p_user,p_scope,coalesce(old_token,p_token),p_config,p_wallet,p_version+1,now())
 ON CONFLICT(user_id,wallet_scope,token) DO UPDATE SET config=EXCLUDED.config,tracked_wallet=EXCLUDED.tracked_wallet,version=EXCLUDED.version,updated_at=now();
 UPDATE public.strategies SET tracked_wallet=p_wallet WHERE user_id=p_user AND wallet_scope=p_scope AND tracked_wallet IS DISTINCT FROM p_wallet;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'estrategia_salva',jsonb_build_object('wallet_scope',p_scope,'token',p_token,'version',p_version+1,'config',p_config));
END $$;
REVOKE ALL ON FUNCTION public.save_user_strategy_scoped(uuid,text,jsonb,text,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_strategy_scoped(uuid,text,jsonb,text,integer,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.save_user_strategy(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_version integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN PERFORM public.save_user_strategy_scoped(p_user,p_token,p_config,p_wallet,p_version,'00000000-0000-0000-0000-000000000000'); END $$;
CREATE FUNCTION public.save_strategy_draft_scoped(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_base_version integer,p_revision integer,p_scope uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_revision integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT revision INTO old_revision FROM public.strategy_drafts WHERE user_id=p_user AND wallet_scope=p_scope AND token=lower(p_token) FOR UPDATE;
 IF coalesce(old_revision,0)<>p_revision THEN RAISE EXCEPTION 'Draft changed'; END IF;
 INSERT INTO public.strategy_drafts(user_id,wallet_scope,token,config,tracked_wallet,base_version,revision)
 VALUES(p_user,p_scope,lower(p_token),p_config,p_wallet,p_base_version,p_revision+1)
 ON CONFLICT(user_id,wallet_scope,token) DO UPDATE SET config=EXCLUDED.config,tracked_wallet=EXCLUDED.tracked_wallet,base_version=EXCLUDED.base_version,revision=EXCLUDED.revision,updated_at=now();
 RETURN p_revision+1;
END $$;
REVOKE ALL ON FUNCTION public.save_strategy_draft_scoped(uuid,text,jsonb,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_strategy_draft_scoped(uuid,text,jsonb,text,integer,integer,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.save_strategy_draft(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_base_version integer,p_revision integer) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN RETURN public.save_strategy_draft_scoped(p_user,p_token,p_config,p_wallet,p_base_version,p_revision,'00000000-0000-0000-0000-000000000000'); END $$;
CREATE FUNCTION public.apply_strategy_with_draft_scoped(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_version integer,p_draft_revision integer,p_scope uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_revision integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT revision INTO current_revision FROM public.strategy_drafts WHERE user_id=p_user AND wallet_scope=p_scope AND token=lower(p_token) FOR UPDATE;
 IF coalesce(current_revision,0)<>p_draft_revision THEN RAISE EXCEPTION 'Draft changed'; END IF;
 -- Existing revision, pending-execution, position and wallet guards remain authoritative.
 PERFORM public.save_user_strategy_scoped(p_user,p_token,p_config,p_wallet,p_version,p_scope);
 DELETE FROM public.strategy_drafts WHERE user_id=p_user AND wallet_scope=p_scope AND token=lower(p_token) AND revision=p_draft_revision;
END $$;
REVOKE ALL ON FUNCTION public.apply_strategy_with_draft_scoped(uuid,text,jsonb,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_strategy_with_draft_scoped(uuid,text,jsonb,text,integer,integer,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.apply_strategy_with_draft(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_version integer,p_draft_revision integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN PERFORM public.apply_strategy_with_draft_scoped(p_user,p_token,p_config,p_wallet,p_version,p_draft_revision,'00000000-0000-0000-0000-000000000000'); END $$;

CREATE FUNCTION public.stamp_submission_scope() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE scope_id uuid;
BEGIN
 SELECT wallet_scope INTO scope_id FROM public.bot_execution_locks WHERE user_id=NEW.user_id AND owner=NEW.lock_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Execution owner mismatch'; END IF;
 NEW.wallet_scope:=scope_id;
 IF NEW.intent ? 'botId' AND NOT EXISTS(SELECT 1 FROM public.grid_bots WHERE id=(NEW.intent->>'botId')::uuid AND user_id=NEW.user_id AND wallet_scope=scope_id) THEN RAISE EXCEPTION 'Bot wallet mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stamp_submission_scope BEFORE INSERT ON public.execution_submissions FOR EACH ROW EXECUTE FUNCTION public.stamp_submission_scope();
CREATE OR REPLACE FUNCTION public.complete_execution_submission(p_id uuid,p_order jsonb,p_patch jsonb,p_receipt jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s public.execution_submissions; b uuid;
BEGIN
 SELECT * INTO s FROM public.execution_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;
 IF s.finished_at IS NOT NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=s.user_id AND owner=s.lock_owner AND wallet_scope=s.wallet_scope) THEN RAISE EXCEPTION 'Execution owner mismatch'; END IF;
 b := (s.intent->>'botId')::uuid;
 IF p_order IS NOT NULL THEN
  INSERT INTO public.orders(user_id,wallet_scope,side,status,wallet,pair_address,amount_in,amount_out_min,quoted_out,slippage_pct,deadline,tx_hash,block_number,error,token,source,gas_bnb,actual_token_delta,actual_bnb_received,accounting_status)
  VALUES(s.user_id,s.wallet_scope,p_order->>'side',p_order->>'status',p_order->>'wallet',p_order->>'pair_address',p_order->>'amount_in',p_order->>'amount_out_min',p_order->>'quoted_out',(p_order->>'slippage_pct')::numeric,(p_order->>'deadline')::bigint,s.tx_hash,(p_order->>'block_number')::bigint,p_order->>'error',p_order->>'token',p_order->>'source',(p_order->>'gas_bnb')::numeric,p_order->>'actual_token_delta',(p_order->>'actual_bnb_received')::numeric,p_order->>'accounting_status');
 END IF;
 IF b IS NOT NULL AND p_patch <> '{}'::jsonb THEN
  UPDATE public.grid_bots SET
   strat_state=coalesce(p_patch->'strat_state',strat_state),
   last_level=CASE WHEN p_patch ? 'last_level' THEN (p_patch->>'last_level')::integer ELSE last_level END,
   last_error=p_patch->>'last_error',last_reason=coalesce(p_patch->>'last_reason',last_reason),last_run_at=now()
  WHERE id=b AND user_id=s.user_id AND wallet_scope=s.wallet_scope;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bot not found'; END IF;
 END IF;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(s.user_id,'execution_receipt',jsonb_build_object('hash',s.tx_hash,'intent',s.intent,'receipt',p_receipt,'accounting',p_order));
 UPDATE public.execution_submissions SET finished_at=now(),receipt=p_receipt WHERE id=p_id;
END $$;
NOTIFY pgrst,'reload schema';
