-- Run together with migration 0019 in BEGIN/ROLLBACK; all fixtures are isolated.
DO $$
DECLARE u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
 scope uuid:='00000000-0000-0000-0000-000000000000'; denied boolean:=false;
BEGIN
 IF has_function_privilege('anon','public.recover_preflight_execution(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.recover_preflight_execution(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Recovery RPC exposed'; END IF;
 INSERT INTO public.bot_execution_locks(user_id,owner,phase) VALUES(u,o,'preparing');
 IF public.recover_preflight_execution(u,scope) THEN RAISE EXCEPTION 'Live worker recovered'; END IF;
 UPDATE public.bot_execution_locks SET acquired_at=now()-interval '20 minutes',phase='unknown' WHERE user_id=u;
 IF public.recover_preflight_execution(u,scope) THEN RAISE EXCEPTION 'Unknown legacy worker recovered'; END IF;
 UPDATE public.bot_execution_locks SET phase='preparing' WHERE user_id=u;
 IF public.recover_preflight_execution(other_user,scope) THEN RAISE EXCEPTION 'Other user recovered worker'; END IF;
 IF public.recover_preflight_execution(u,gen_random_uuid()) THEN RAISE EXCEPTION 'Other scope recovered worker'; END IF;
 IF NOT public.recover_preflight_execution(u,scope) THEN RAISE EXCEPTION 'Abandoned preflight stuck'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_log WHERE user_id=u AND action='execution_preflight_recovered') THEN RAISE EXCEPTION 'Recovery not audited'; END IF;
 -- A paused process holding an old signed transaction must fail before network broadcast.
 BEGIN INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent) VALUES(gen_random_uuid(),u,o,'0x'||replace(gen_random_uuid()::text,'-',''),0,'{}');
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM LIKE '%owner mismatch%'; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired worker can register a broadcast'; END IF;
 -- Saving and starting a new bot now work without touching any existing user's data.
 PERFORM public.save_user_strategy_scoped(u,'0x1111111111111111111111111111111111111111','{}',null,0,scope);
 INSERT INTO public.grid_bots(user_id,token,armed) VALUES(u,'0x1111111111111111111111111111111111111111',true);
 UPDATE public.grid_bots SET armed=false WHERE user_id=u;
 -- Registration atomically marks submitted and prevents receipt-free recovery.
 o:=gen_random_uuid();
 INSERT INTO public.bot_execution_locks(user_id,owner,phase,acquired_at) VALUES(u,o,'preparing',now()-interval '20 minutes');
 INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent) VALUES(gen_random_uuid(),u,o,'0x'||replace(gen_random_uuid()::text,'-',''),0,'{}');
 IF NOT EXISTS(SELECT 1 FROM public.bot_execution_locks WHERE owner=o AND phase='submitted') THEN RAISE EXCEPTION 'Registration did not mark submitted'; END IF;
 IF public.recover_preflight_execution(u,scope) THEN RAISE EXCEPTION 'Pending submission recovered'; END IF;
 -- Defense in depth: even incorrect preflight marking cannot discard a journal entry.
 UPDATE public.bot_execution_locks SET phase='preparing' WHERE owner=o;
 IF public.recover_preflight_execution(u,scope) THEN RAISE EXCEPTION 'Journal ignored'; END IF;
 UPDATE public.execution_submissions SET finished_at=now() WHERE lock_owner=o;
 IF public.recover_preflight_execution(u,scope) THEN RAISE EXCEPTION 'Completed approval discarded'; END IF;
END $$;
