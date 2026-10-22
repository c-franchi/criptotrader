-- Execute inside a transaction followed by ROLLBACK; fixtures are isolated random users.
DO $$
DECLARE u uuid:=gen_random_uuid(); t text:='0x1111111111111111111111111111111111111111'; owner_id uuid:=gen_random_uuid(); rejected boolean:=false;
BEGIN
 IF has_table_privilege('authenticated','public.strategy_drafts','SELECT') OR has_table_privilege('anon','public.strategy_drafts','SELECT') THEN RAISE EXCEPTION 'Draft table exposed'; END IF;
 IF has_function_privilege('authenticated','public.save_strategy_draft(uuid,text,jsonb,text,integer,integer)','EXECUTE') OR has_function_privilege('anon','public.apply_strategy_with_draft(uuid,text,jsonb,text,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Draft RPC exposed'; END IF;
 PERFORM public.save_user_strategy(u,t,'{}',NULL,0);
 INSERT INTO public.grid_bots(user_id,token,armed) VALUES(u,t,false);
 INSERT INTO public.bot_execution_locks(user_id,owner) VALUES(u,owner_id);
 PERFORM public.save_strategy_draft(u,t,'{"buyAmount":2}',NULL,1,0);
 IF (SELECT config FROM public.strategies WHERE user_id=u) <> '{}'::jsonb THEN RAISE EXCEPTION 'Live config changed while saving draft'; END IF;
 BEGIN PERFORM public.save_strategy_draft(u,t,'{"buyAmount":3}',NULL,1,0); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM='Draft changed'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Concurrent draft overwrite accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM public.apply_strategy_with_draft(u,t,'{"buyAmount":2}',NULL,1,1); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%Execution in progress%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Pending execution guard bypassed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.strategy_drafts WHERE user_id=u AND revision=1) THEN RAISE EXCEPTION 'Draft lost on failed apply'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=u AND owner=owner_id) THEN RAISE EXCEPTION 'Lock removed by draft'; END IF;
 -- Only this test fixture's lock is removed. The production lock is never touched.
 DELETE FROM public.bot_execution_locks WHERE user_id=u AND owner=owner_id;
 PERFORM public.apply_strategy_with_draft(u,t,'{"buyAmount":2}',NULL,1,1);
 IF (SELECT version FROM public.strategies WHERE user_id=u)<>2 OR EXISTS(SELECT 1 FROM public.strategy_drafts WHERE user_id=u) THEN RAISE EXCEPTION 'Apply did not atomically update and consume draft'; END IF;
 UPDATE public.grid_bots SET strat_state='{"tokens":1}' WHERE user_id=u;
 PERFORM public.save_strategy_draft(u,t,'{"buyAmount":3}',NULL,2,0);
 rejected:=false;
 BEGIN PERFORM public.apply_strategy_with_draft(u,t,'{"buyAmount":3}',NULL,2,1); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%Open position%'; END;
 IF NOT rejected OR (SELECT version FROM public.strategies WHERE user_id=u)<>2 THEN RAISE EXCEPTION 'Open position guard bypassed'; END IF;
END $$;
