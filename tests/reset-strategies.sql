-- Run BEGIN + migration + this file + ROLLBACK. Isolated random fixture users only.
DO $$
DECLARE u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); t text:='0x1111111111111111111111111111111111111111'; o uuid:=gen_random_uuid(); rejected boolean:=false; result jsonb;
BEGIN
 IF has_function_privilege('authenticated','public.reset_strategy_configuration(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.reset_strategy_configuration(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Reset RPC exposed'; END IF;
 PERFORM public.save_user_strategy(u,t,'{"buyAmount":1}',NULL,0);
 PERFORM public.save_user_strategy(v,t,'{"buyAmount":2}',NULL,0);
 INSERT INTO public.grid_bots(user_id,token,armed) VALUES(u,t,true),(v,t,true);
 PERFORM public.save_strategy_draft(u,t,'{"buyAmount":3}',NULL,1,0);
 INSERT INTO public.bot_execution_locks(user_id,owner) VALUES(u,o);
 result:=public.reset_strategy_configuration(u,NULL);
 IF result->>'strategies'<>'1' OR result->>'drafts'<>'1' OR result->>'bots'<>'1' THEN RAISE EXCEPTION 'Reset counts incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.grid_bots WHERE user_id=u AND NOT armed) OR EXISTS(SELECT 1 FROM public.strategies WHERE user_id=u) OR EXISTS(SELECT 1 FROM public.strategy_drafts WHERE user_id=u) THEN RAISE EXCEPTION 'Reset did not preserve paused bot'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=u AND owner=o) THEN RAISE EXCEPTION 'Reset removed mutex'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_log WHERE user_id=u AND action='strategies_reset' AND jsonb_array_length(details->'strategies')=1) THEN RAISE EXCEPTION 'Reset archive missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.strategies WHERE user_id=v) OR NOT EXISTS(SELECT 1 FROM public.grid_bots WHERE user_id=v AND armed) THEN RAISE EXCEPTION 'Other user changed'; END IF;
 UPDATE public.grid_bots SET strat_state='{"tokens":1,"costBnb":0.1}' WHERE user_id=v;
 BEGIN PERFORM public.reset_strategy_configuration(v,NULL); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%posição aberta%'; END;
 IF NOT rejected OR NOT EXISTS(SELECT 1 FROM public.strategies WHERE user_id=v) THEN RAISE EXCEPTION 'Open position was reset'; END IF;
 INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent) VALUES(gen_random_uuid(),u,o,'0x'||replace(gen_random_uuid()::text,'-',''),0,'{}');
 rejected:=false;
 BEGIN PERFORM public.reset_strategy_configuration(u,NULL); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%transação pendente%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Pending operation was reset'; END IF;
END $$;
