-- Additive function only. Does not run a replacement, sell tokens, alter keys or erase history.
-- Install this function on the existing application schema, independently of historical migration reconciliation.
BEGIN;
CREATE OR REPLACE FUNCTION public.replace_chart_plan(
 p_user uuid,p_scope uuid,p_token text,p_config jsonb,p_version integer,p_draft_revision integer,p_grid jsonb,
 p_bot uuid,p_updated_at timestamptz,p_confirmation text,p_state jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.grid_bots; old_strategy jsonb; result_id uuid; next_state jsonb; retained jsonb; at_time timestamptz; has_position boolean;
BEGIN
 IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Server-only replacement'; END IF;
 IF p_confirmation IS DISTINCT FROM 'SUBSTITUIR ATIVIDADE' THEN RAISE EXCEPTION 'Confirmação explícita obrigatória'; END IF;
 IF p_config->>'guidedModel' IS DISTINCT FROM 'chart' OR p_config->'chartRule'->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Plano gráfico inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT * INTO b FROM public.grid_bots WHERE id=p_bot AND user_id=p_user AND wallet_scope=p_scope AND lower(token)=lower(p_token) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atividade anterior não encontrada nesta carteira'; END IF;
 IF b.updated_at IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'O estado mudou. Confira novamente antes de substituir'; END IF;
 IF (coalesce(nullif(b.strat_state,'null'::jsonb),'{}'::jsonb)-'retainedPosition') IS DISTINCT FROM (coalesce(nullif(p_state,'null'::jsonb),'{}'::jsonb)-'retainedPosition') THEN RAISE EXCEPTION 'O estado mudou. Confira novamente antes de substituir'; END IF;
 IF EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=p_user AND wallet_scope=p_scope)
 OR EXISTS(SELECT 1 FROM public.execution_submissions WHERE user_id=p_user AND wallet_scope=p_scope AND finished_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.orders WHERE user_id=p_user AND wallet_scope=p_scope AND status='enviada')
 THEN RAISE EXCEPTION 'Operação pendente: aguarde a confirmação antes de substituir'; END IF;
 SELECT to_jsonb(s) INTO old_strategy FROM public.strategies s WHERE user_id=p_user AND wallet_scope=p_scope AND lower(token)=lower(p_token) FOR UPDATE;
 IF coalesce((old_strategy->>'version')::integer,0)<>p_version THEN RAISE EXCEPTION 'A configuração mudou. Confira novamente'; END IF;
 at_time:=clock_timestamp();
 has_position:=coalesce((b.strat_state->>'tokens')::numeric,0)>0 OR coalesce((b.strat_state->>'costBnb')::numeric,0)>0 OR coalesce((b.strat_state->>'tokensRaw')::numeric,0)>0;
 retained:=jsonb_build_object(
   'count',coalesce((b.strat_state->'retainedPosition'->>'count')::integer,0)+CASE WHEN has_position THEN 1 ELSE 0 END,
   'tokensAtReplacement',coalesce((b.strat_state->'retainedPosition'->>'tokensAtReplacement')::numeric,0)+coalesce((b.strat_state->>'tokens')::numeric,0),
   'costBnbAtReplacement',coalesce((b.strat_state->'retainedPosition'->>'costBnbAtReplacement')::numeric,0)+coalesce((b.strat_state->>'costBnb')::numeric,0)
 );
 -- Preserve the complete old record/config, not a fabricated sale or realized profit.
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'chart_plan_replaced',jsonb_build_object(
   'wallet_scope',p_scope,'token',p_token,'bot_id',b.id,'previous_bot',to_jsonb(b),'previous_strategy',old_strategy,
   'new_rule_id',p_config->'chartRule'->>'id','tokens_sold',false,'previous_position_managed_by_new_plan',false,'started',false
 ));
 -- Only active execution memory is restarted. Existing holdings remain on chain, and their immutable snapshot is above.
 -- Daily risk counters are carried forward; replacement cannot reset a daily loss/trade limit.
 next_state:=jsonb_build_object('tokens',0,'tokensRaw','0','costBnb',0,'entries',0,'avgPriceUsd',0,'lastBuyUsd',0,'peakUsd',0,'tpDone','[]'::jsonb,
   'day',coalesce(b.strat_state->>'day',''),'tradesToday',coalesce(b.strat_state->'tradesToday','0'::jsonb),
   'lossTodayBnb',coalesce(b.strat_state->'lossTodayBnb','0'::jsonb),'lastTradeAt',coalesce(b.strat_state->'lastTradeAt','0'::jsonb),
   'activityStartedAt',at_time,'retainedPosition',retained);
 UPDATE public.grid_bots SET armed=false,strat_state=next_state,updated_at=at_time WHERE id=b.id AND user_id=p_user AND wallet_scope=p_scope;
 -- Existing triggers and version/draft guards remain installed. Any rejection rolls back the entire transaction, including memory and audit.
 result_id:=public.configure_guided_bot(p_user,p_scope,p_token,p_config,p_version,p_draft_revision,p_grid);
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.replace_chart_plan(uuid,uuid,text,jsonb,integer,integer,jsonb,uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_chart_plan(uuid,uuid,text,jsonb,integer,integer,jsonb,uuid,timestamptz,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';

COMMIT;
