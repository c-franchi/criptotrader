-- Isolated fixtures; execute in a transaction with ROLLBACK.
DO $$
DECLARE u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); b uuid; o uuid:=gen_random_uuid(); t text:='0x1111111111111111111111111111111111111111'; rejected boolean:=false;
BEGIN
 IF has_function_privilege('anon','public.remove_paused_bot(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.remove_paused_bot(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Removal RPC exposed'; END IF;
 INSERT INTO public.grid_bots(user_id,token,armed) VALUES(u,t,true) RETURNING id INTO b;
 BEGIN PERFORM public.remove_paused_bot(u,'00000000-0000-0000-0000-000000000000',b); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%ligado%' OR SQLERRM LIKE '%Pause%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Running bot removed'; END IF;
 UPDATE public.grid_bots SET armed=false,strat_state='{"tokens":1,"costBnb":0.1}' WHERE id=b;
 rejected:=false;
 BEGIN PERFORM public.remove_paused_bot(u,'00000000-0000-0000-0000-000000000000',b); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%posição aberta%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Open position removed'; END IF;
 UPDATE public.grid_bots SET strat_state='{"tokens":0,"costBnb":0}' WHERE id=b;
 INSERT INTO public.bot_execution_locks(user_id,owner) VALUES(u,o);
 INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent) VALUES(gen_random_uuid(),u,o,'0x'||replace(gen_random_uuid()::text,'-',''),0,'{}');
 rejected:=false;
 BEGIN PERFORM public.remove_paused_bot(u,'00000000-0000-0000-0000-000000000000',b); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%transação pendente%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Pending submission ignored'; END IF;
 UPDATE public.execution_submissions SET finished_at=now() WHERE user_id=u;
 rejected:=false;
 BEGIN PERFORM public.remove_paused_bot(v,'00000000-0000-0000-0000-000000000000',b); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%não encontrado%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Other user removed bot'; END IF;
 PERFORM public.remove_paused_bot(u,'00000000-0000-0000-0000-000000000000',b);
 IF NOT EXISTS(SELECT 1 FROM public.grid_bots WHERE id=b AND archived_at IS NOT NULL AND NOT armed) THEN RAISE EXCEPTION 'Paused bot not archived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE user_id=u AND owner=o) THEN RAISE EXCEPTION 'Removal erased mutex'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_log WHERE user_id=u AND action='bot_removed' AND details->'bot'->>'id'=b::text) THEN RAISE EXCEPTION 'Removal audit missing'; END IF;
 PERFORM public.remove_paused_bot(u,'00000000-0000-0000-0000-000000000000',b);
 UPDATE public.grid_bots SET strat_state='{"tokens":2,"costBnb":0.1}' WHERE id=b;
 IF NOT EXISTS(SELECT 1 FROM public.grid_bots WHERE id=b AND archived_at IS NULL AND NOT armed) THEN RAISE EXCEPTION 'Late receipt position was hidden'; END IF;
END $$;
