-- Save the rules and paused bot as one operation. Existing strategies/positions are not migrated.
CREATE FUNCTION public.configure_guided_bot(p_user uuid,p_scope uuid,p_token text,p_config jsonb,p_version integer,p_draft_revision integer,p_grid jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.grid_bots; t text; result_id uuid; tracked text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 IF lower(p_token)='0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' THEN RAISE EXCEPTION 'BNB e WBNB são o mesmo ativo. Escolha outra moeda para comprar com BNB.'; END IF;
 SELECT * INTO b FROM public.grid_bots WHERE user_id=p_user AND wallet_scope=p_scope AND lower(token)=lower(p_token) FOR UPDATE;
 IF FOUND AND (b.armed OR coalesce((b.strat_state->>'tokens')::numeric,0)>0 OR coalesce((b.strat_state->>'costBnb')::numeric,0)>0) THEN RAISE EXCEPTION 'Pause o robô e aguarde encerrar a posição antes de substituir suas regras.'; END IF;
 t:=coalesce(b.token,p_token);
 SELECT tracked_wallet INTO tracked FROM public.strategies WHERE user_id=p_user AND wallet_scope=p_scope AND tracked_wallet IS NOT NULL ORDER BY (lower(token)=lower(p_token)) DESC,updated_at DESC LIMIT 1;
 PERFORM public.apply_strategy_with_draft_scoped(p_user,p_token,p_config,tracked,p_version,p_draft_revision,p_scope);
 INSERT INTO public.grid_bots(user_id,wallet_scope,token,mode,armed,archived_at,lower_price,upper_price,levels,order_bnb,gas_reserve_bnb,max_slippage_pct,max_impact_pct)
 VALUES(p_user,p_scope,t,CASE WHEN p_config->>'guidedModel'='grid' THEN 'grade' ELSE 'estrategia' END,false,null,coalesce((p_grid->>'lower')::numeric,0),coalesce((p_grid->>'upper')::numeric,0),coalesce((p_grid->>'levels')::integer,10),(p_config->>'buyAmount')::numeric,(p_config->>'gasReserveBnb')::numeric,(p_config->>'maxSlippagePct')::numeric,(p_config->>'maxPriceImpactPct')::numeric)
 ON CONFLICT(user_id,wallet_scope,token) DO UPDATE SET mode=EXCLUDED.mode,armed=false,archived_at=null,lower_price=EXCLUDED.lower_price,upper_price=EXCLUDED.upper_price,levels=EXCLUDED.levels,order_bnb=EXCLUDED.order_bnb,gas_reserve_bnb=EXCLUDED.gas_reserve_bnb,max_slippage_pct=EXCLUDED.max_slippage_pct,max_impact_pct=EXCLUDED.max_impact_pct,last_level=null,last_error=null,last_reason='Configuração salva. Revise as verificações antes de iniciar.',updated_at=now()
 RETURNING id INTO result_id;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'guided_bot_saved',jsonb_build_object('wallet_scope',p_scope,'bot_id',result_id,'model',p_config->>'guidedModel','version',p_version+1,'started',false));
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.configure_guided_bot(uuid,uuid,text,jsonb,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_guided_bot(uuid,uuid,text,jsonb,integer,integer,jsonb) TO service_role;

-- Browser writes may pause; starting must pass server-side readiness checks.
CREATE FUNCTION public.guard_bot_start_readiness() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.armed AND (TG_OP='INSERT' OR NOT OLD.armed) THEN
  IF lower(NEW.token)='0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' THEN RAISE EXCEPTION 'BNB e WBNB são o mesmo ativo. Escolha outra moeda para comprar com BNB.'; END IF;
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN RAISE EXCEPTION 'Use Iniciar robô para conferir saldo, mercado e custos no servidor.'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_bot_start_readiness() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_bot_start_readiness BEFORE INSERT OR UPDATE ON public.grid_bots FOR EACH ROW EXECUTE FUNCTION public.guard_bot_start_readiness();

CREATE FUNCTION public.start_checked_bot(p_user uuid,p_scope uuid,p_bot uuid,p_version integer,p_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.grid_bots; v integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT * INTO b FROM public.grid_bots WHERE id=p_bot AND user_id=p_user AND wallet_scope=p_scope AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Robô não encontrado nesta carteira.'; END IF;
 SELECT version INTO v FROM public.strategies WHERE user_id=p_user AND wallet_scope=p_scope AND lower(token)=lower(b.token);
 IF v IS DISTINCT FROM p_version OR b.updated_at IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'A configuração mudou. Confira novamente antes de iniciar.'; END IF;
 UPDATE public.grid_bots SET armed=true,updated_at=now() WHERE id=b.id;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'bot_armed',jsonb_build_object('wallet_scope',p_scope,'bot_id',b.id,'token',b.token,'version',v,'readiness_checked',true));
END $$;
REVOKE ALL ON FUNCTION public.start_checked_bot(uuid,uuid,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_checked_bot(uuid,uuid,uuid,integer,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
