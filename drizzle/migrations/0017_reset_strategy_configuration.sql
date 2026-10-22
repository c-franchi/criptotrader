-- Explicit configuration reset. Never removes a wallet, bot, position, receipt or mutex.
CREATE FUNCTION public.reset_strategy_configuration(p_user uuid,p_scope uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE scope_id uuid; before_strategies jsonb; before_drafts jsonb; before_bots jsonb;
 strategy_count integer; draft_count integer; bot_count integer;
BEGIN
 IF p_user IS NULL THEN RAISE EXCEPTION 'User required'; END IF;
 FOR scope_id IN
  SELECT wallet_scope FROM public.grid_bots WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope)
  UNION SELECT wallet_scope FROM public.strategies WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope)
  UNION SELECT wallet_scope FROM public.strategy_drafts WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope)
  ORDER BY wallet_scope
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||scope_id::text,0));
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.execution_submissions WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope) AND finished_at IS NULL)
 THEN RAISE EXCEPTION 'Há transação pendente. Concilie a operação antes de resetar as estratégias'; END IF;
 IF EXISTS(SELECT 1 FROM public.grid_bots WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope) AND (coalesce((strat_state->>'tokens')::numeric,0)>0 OR coalesce((strat_state->>'costBnb')::numeric,0)>0))
 THEN RAISE EXCEPTION 'Há posição aberta. O reset não vende ativos nem apaga posições'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO before_strategies FROM public.strategies s WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope);
 SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) INTO before_drafts FROM public.strategy_drafts d WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'wallet_scope',b.wallet_scope,'token',b.token,'armed',b.armed,'mode',b.mode,'strat_state',b.strat_state)),'[]'::jsonb) INTO before_bots FROM public.grid_bots b WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope);
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'strategies_reset',jsonb_build_object('wallet_scope',p_scope,'strategies',before_strategies,'drafts',before_drafts,'bots',before_bots,'execution_locks_preserved',true));
 UPDATE public.grid_bots SET armed=false,updated_at=now() WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope);
 GET DIAGNOSTICS bot_count=ROW_COUNT;
 DELETE FROM public.strategy_drafts WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope);
 GET DIAGNOSTICS draft_count=ROW_COUNT;
 DELETE FROM public.strategies WHERE user_id=p_user AND (p_scope IS NULL OR wallet_scope=p_scope);
 GET DIAGNOSTICS strategy_count=ROW_COUNT;
 RETURN jsonb_build_object('strategies',strategy_count,'drafts',draft_count,'bots',bot_count,'locks_preserved',true);
END $$;
REVOKE ALL ON FUNCTION public.reset_strategy_configuration(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_strategy_configuration(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
