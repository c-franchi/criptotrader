CREATE OR REPLACE FUNCTION public.serialize_bot_wallet_changes() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0)); RETURN NEW; END $$;
CREATE TRIGGER serialize_bot_execution_lock BEFORE INSERT ON public.bot_execution_locks FOR EACH ROW EXECUTE FUNCTION public.serialize_bot_wallet_changes();
CREATE OR REPLACE FUNCTION public.guard_bot_strategy_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
IF EXISTS (SELECT 1 FROM public.bot_execution_locks WHERE user_id = NEW.user_id) THEN RAISE EXCEPTION 'Execution in progress: wait for reconciliation before editing strategy'; END IF;
IF TG_OP = 'UPDATE' AND NEW.config IS DISTINCT FROM OLD.config AND EXISTS (SELECT 1 FROM public.grid_bots WHERE user_id = NEW.user_id AND lower(token) = lower(NEW.token) AND coalesce((strat_state->>'tokens')::numeric,0) > 0) THEN RAISE EXCEPTION 'Open position: preserve cycle configuration'; END IF;
RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_grid_configuration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed boolean;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
IF TG_OP = 'INSERT' THEN changed := true; ELSE
changed := ROW(NEW.mode,NEW.token,NEW.lower_price,NEW.upper_price,NEW.levels,NEW.order_bnb,NEW.max_slippage_pct,NEW.max_impact_pct,NEW.gas_reserve_bnb) IS DISTINCT FROM ROW(OLD.mode,OLD.token,OLD.lower_price,OLD.upper_price,OLD.levels,OLD.order_bnb,OLD.max_slippage_pct,OLD.max_impact_pct,OLD.gas_reserve_bnb);
IF changed AND coalesce((OLD.strat_state->>'tokens')::numeric,0) > 0 THEN RAISE EXCEPTION 'Open position: preserve cycle configuration'; END IF;
END IF;
IF (changed OR (TG_OP = 'UPDATE' AND NEW.armed AND NOT OLD.armed)) AND EXISTS (SELECT 1 FROM public.bot_execution_locks WHERE user_id = NEW.user_id) THEN RAISE EXCEPTION 'Wallet execution pending: configuration locked'; END IF;
RETURN NEW;
END $$;
CREATE TRIGGER guard_grid_configuration_writes BEFORE INSERT OR UPDATE ON public.grid_bots FOR EACH ROW EXECUTE FUNCTION public.guard_grid_configuration();