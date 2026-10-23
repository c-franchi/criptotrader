DO $$
DECLARE u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); scope uuid:='00000000-0000-0000-0000-000000000000'; t text:='0x1111111111111111111111111111111111111111'; b uuid; cfg jsonb:='{"guidedModel":"dca","buyAmount":0.001,"gasReserveBnb":0.0001,"maxSlippagePct":1,"maxPriceImpactPct":2}'; old_time timestamptz; refused boolean;
BEGIN
 IF has_function_privilege('authenticated','public.configure_guided_bot(uuid,uuid,text,jsonb,integer,integer,jsonb)','EXECUTE') OR has_function_privilege('anon','public.start_checked_bot(uuid,uuid,uuid,integer,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Privileged guided RPC exposed'; END IF;
 PERFORM public.save_user_strategy_scoped(u,'0x3333333333333333333333333333333333333333','{}','0x4444444444444444444444444444444444444444',0,scope);
 b:=public.configure_guided_bot(u,scope,t,cfg,0,0,'{}');
 IF EXISTS(SELECT 1 FROM strategies WHERE user_id=u AND tracked_wallet IS DISTINCT FROM '0x4444444444444444444444444444444444444444') THEN RAISE EXCEPTION 'Guided setup erased personal wallet tracking';END IF;
 IF NOT EXISTS(SELECT 1 FROM grid_bots WHERE id=b AND NOT armed AND archived_at IS NULL) THEN RAISE EXCEPTION 'Setup unexpectedly started bot'; END IF;
 SELECT updated_at INTO old_time FROM grid_bots WHERE id=b;
 refused:=false;
 BEGIN PERFORM public.start_checked_bot(v,scope,b,1,old_time);EXCEPTION WHEN OTHERS THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'Other user started bot'; END IF;
 refused:=false;
 BEGIN PERFORM public.start_checked_bot(u,scope,b,0,old_time);EXCEPTION WHEN OTHERS THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'Stale configuration started'; END IF;
 PERFORM public.start_checked_bot(u,scope,b,1,old_time);
 refused:=false;
 BEGIN PERFORM public.configure_guided_bot(u,scope,t,cfg,1,0,'{}');EXCEPTION WHEN OTHERS THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'Running configuration replaced'; END IF;
 IF (SELECT version FROM strategies WHERE user_id=u AND wallet_scope=scope AND lower(token)=lower(t))<>1 THEN RAISE EXCEPTION 'Atomic save partially wrote strategy'; END IF;
 UPDATE grid_bots SET armed=false,strat_state='{"tokens":1,"costBnb":0.001}' WHERE id=b;
 refused:=false;
 BEGIN PERFORM public.configure_guided_bot(u,scope,t,cfg,1,0,'{}');EXCEPTION WHEN OTHERS THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'Open position overwritten'; END IF;
 refused:=false;
 BEGIN PERFORM public.configure_guided_bot(u,scope,'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',cfg,0,0,'{}');EXCEPTION WHEN OTHERS THEN refused:=SQLERRM LIKE '%BNB e WBNB%'; END;
 IF NOT refused THEN RAISE EXCEPTION 'Same asset accepted'; END IF;
 INSERT INTO grid_bots(user_id,token,armed) VALUES(u,'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',false);
 refused:=false;
 BEGIN UPDATE grid_bots SET armed=true WHERE user_id=u AND lower(token)='0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';EXCEPTION WHEN OTHERS THEN refused:=SQLERRM LIKE '%BNB e WBNB%'; END;
 IF NOT refused THEN RAISE EXCEPTION 'Same asset bypassed start trigger'; END IF;
END $$;
-- Verify that an ordinary authenticated client cannot bypass server readiness, even through RLS-owned rows.
SELECT set_config('test.guided_user',gen_random_uuid()::text,true);
INSERT INTO public.grid_bots(user_id,token,armed) VALUES(current_setting('test.guided_user')::uuid,'0x2222222222222222222222222222222222222222',false);
SELECT set_config('request.jwt.claims',json_build_object('sub',current_setting('test.guided_user'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN UPDATE public.grid_bots SET armed=true WHERE user_id=auth.uid();EXCEPTION WHEN OTHERS THEN denied:=SQLERRM LIKE '%Use Iniciar robô%';END;
 IF NOT denied THEN RAISE EXCEPTION 'Client bypassed server readiness';END IF;
 UPDATE public.grid_bots SET armed=false WHERE user_id=auth.uid();
END $$;
RESET ROLE;
