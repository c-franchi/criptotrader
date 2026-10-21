-- Run after the migration, inside a transaction that the caller MUST roll back.
DO $$
DECLARE u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); lock_id uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); alert_id uuid:=gen_random_uuid(); rejected boolean:=false; n integer;
BEGIN
 IF has_table_privilege('authenticated','public.execution_submissions','SELECT') THEN RAISE EXCEPTION 'Journal exposed'; END IF;
 IF has_table_privilege('authenticated','public.sim_accounts','UPDATE') THEN RAISE EXCEPTION 'Simulation direct writes still allowed'; END IF;
 IF has_function_privilege('authenticated','public.complete_execution_submission(uuid,jsonb,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Settlement RPC exposed'; END IF;
 INSERT INTO public.sim_accounts(id,user_id,token,quote_symbol,initial_quote,quote_balance) VALUES(a,u,'0x1111111111111111111111111111111111111111','WBNB',1,1);
 PERFORM public.apply_sim_trade(u,a,0,req,'0x1111111111111111111111111111111111111111','{"quote":"0.5","tokens":"50","costBasis":"0.5","realized":"0","fees":"0"}','{"side":"compra","price":"0.01","quote_amount":"0.5","token_amount":"50","fee":"0","gas_estimate":"0","slippage_pct":"1","realized_pnl":"0"}');
 PERFORM public.apply_sim_trade(u,a,0,req,'0x1111111111111111111111111111111111111111','{}','{}');
 SELECT count(*) INTO n FROM public.sim_trades WHERE account_id=a; IF n<>1 THEN RAISE EXCEPTION 'Duplicate simulation fill'; END IF;
 BEGIN PERFORM public.apply_sim_trade(u,a,0,gen_random_uuid(),'0x1111111111111111111111111111111111111111','{}','{}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale simulation revision accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM public.apply_sim_trade(u,a,1,gen_random_uuid(),'0x2222222222222222222222222222222222222222','{}','{}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-token simulation accepted'; END IF;
 INSERT INTO public.grid_bots(id,user_id,token) VALUES(b,u,'0x1111111111111111111111111111111111111111');
 INSERT INTO public.bot_execution_locks(user_id,owner) VALUES(u,lock_id);
 INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent) VALUES(s,u,lock_id,'0x'||replace(s::text,'-','')||replace(s::text,'-',''),1,jsonb_build_object('kind','swap','botId',b));
 PERFORM public.complete_execution_submission(s,jsonb_build_object('side','compra','status','confirmada','wallet','0x1111111111111111111111111111111111111111','amount_in','1','amount_out_min','1','quoted_out','1','slippage_pct',1,'deadline',1,'block_number',1,'token','0x1111111111111111111111111111111111111111','source','robo','gas_bnb',0,'actual_token_delta','1','accounting_status','confirmado'),'{"strat_state":{"entries":1,"tokens":1},"last_reason":"test"}','{"status":"success"}');
 PERFORM public.complete_execution_submission(s,NULL,'{"strat_state":{"entries":999}}','{}');
 SELECT count(*) INTO n FROM public.orders WHERE user_id=u; IF n<>1 THEN RAISE EXCEPTION 'Duplicate settlement'; END IF;
 SELECT (strat_state->>'entries')::integer INTO n FROM public.grid_bots WHERE id=b; IF n<>1 THEN RAISE EXCEPTION 'Settlement not idempotent'; END IF;
 INSERT INTO public.price_alerts(id,user_id,token_address,symbol,base_price,target_pct) VALUES(alert_id,u,'0x1111111111111111111111111111111111111111','TEST',1,5);
 PERFORM public.record_alert_transition(alert_id,'longe','atingiu',0.95,now(),'test','test');
 PERFORM public.record_alert_transition(alert_id,'longe','atingiu',0.95,now(),'test','test');
 SELECT count(*) INTO n FROM public.notifications WHERE user_id=u; IF n<>1 THEN RAISE EXCEPTION 'Duplicate alert transition'; END IF;
END $$;

DO $$
DECLARE u uuid:=gen_random_uuid(); rejected boolean:=false; stored timestamptz;
BEGIN
 PERFORM public.save_user_strategy(u,'0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','{}',NULL,0);
 BEGIN PERFORM public.save_user_strategy(u,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}',NULL,0); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale strategy version accepted'; END IF;
 PERFORM public.save_user_strategy(u,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}',NULL,1);
 IF (SELECT count(*) FROM public.strategies WHERE user_id=u)<>1 THEN RAISE EXCEPTION 'Case-variant strategy duplicated'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO public.user_wallets(user_id,address,label,created_at) VALUES(u,'0x1111111111111111111111111111111111111111','test',now()-interval '2 days') RETURNING created_at INTO stored;
 IF stored<now()-interval '1 minute' THEN RAISE EXCEPTION 'Wallet age spoofed'; END IF;
 rejected:=false;
 BEGIN UPDATE public.user_wallets SET created_at=now()-interval '2 days' WHERE user_id=u; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Wallet age edited'; END IF;
 EXECUTE 'RESET ROLE';
END $$;
