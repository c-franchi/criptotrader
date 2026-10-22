-- Run in a transaction followed by ROLLBACK. No production user data or keys are used.
DO $$
DECLARE
 u uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); foreign_scope uuid:=gen_random_uuid();
 lock_a uuid:=gen_random_uuid(); lock_b uuid:=gen_random_uuid(); bot_a uuid; bot_b uuid; submission uuid:=gen_random_uuid(); rejected boolean:=false;
 t text:='0x1111111111111111111111111111111111111111';
BEGIN
 INSERT INTO public.user_wallets(id,user_id,address,label) VALUES
 (a,u,'0x1111111111111111111111111111111111111111','A'),(b,u,'0x2222222222222222222222222222222222222222','B'),
 (foreign_scope,stranger,'0x3333333333333333333333333333333333333333','Other user');
 INSERT INTO public.bot_wallets(user_id,wallet_scope,address,enc_key) VALUES
 (u,a,'0x'||replace(gen_random_uuid()::text,'-','')||'11111111','fixture-unused'),
 (u,b,'0x'||replace(gen_random_uuid()::text,'-','')||'22222222','fixture-unused');
 PERFORM public.save_user_strategy_scoped(u,t,'{"buyAmount":1}',NULL,0,a);
 PERFORM public.save_user_strategy_scoped(u,t,'{"buyAmount":2}',NULL,0,b);
 INSERT INTO public.grid_bots(user_id,wallet_scope,token,armed) VALUES(u,a,t,true) RETURNING id INTO bot_a;
 INSERT INTO public.grid_bots(user_id,wallet_scope,token,armed) VALUES(u,b,t,true) RETURNING id INTO bot_b;
 INSERT INTO public.bot_execution_locks(user_id,wallet_scope,owner) VALUES(u,a,lock_a),(u,b,lock_b);
 BEGIN INSERT INTO public.bot_execution_locks(user_id,wallet_scope,owner) VALUES(u,a,gen_random_uuid()); EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Same wallet allowed concurrent signers'; END IF;
 rejected:=false;
 BEGIN PERFORM public.save_user_strategy_scoped(u,t,'{"buyAmount":9}',NULL,1,a); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%Execution in progress%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Pending wallet strategy guard bypassed'; END IF;
 PERFORM public.save_strategy_draft_scoped(u,t,'{"buyAmount":3}',NULL,1,0,a);
 IF (SELECT count(*) FROM public.strategy_drafts WHERE user_id=u AND wallet_scope=b)<>0 THEN RAISE EXCEPTION 'Draft leaked between wallets'; END IF;
 DELETE FROM public.bot_execution_locks WHERE owner=lock_b;
 PERFORM public.save_user_strategy_scoped(u,t,'{"buyAmount":4}',NULL,1,b);
 IF (SELECT (config->>'buyAmount')::int FROM public.strategies WHERE user_id=u AND wallet_scope=a)<>1 THEN RAISE EXCEPTION 'Other wallet config changed'; END IF;
 -- Disarming one portfolio must leave the other running.
 UPDATE public.grid_bots SET armed=false WHERE user_id=u AND wallet_scope=a;
 IF NOT (SELECT armed FROM public.grid_bots WHERE id=bot_b) THEN RAISE EXCEPTION 'Other wallet bot paused'; END IF;
 rejected:=false;
 BEGIN UPDATE public.grid_bots SET wallet_scope=b WHERE id=bot_a; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Bot moved between funded wallets'; END IF;
 rejected:=false;
 BEGIN PERFORM public.save_user_strategy_scoped(u,t,'{}',NULL,0,foreign_scope); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%does not belong%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign user wallet accepted'; END IF;
 -- Journal takes its scope from the acquired lock, and rejects a bot in another wallet.
 INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent)
 VALUES(submission,u,lock_a,'0x'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),0,jsonb_build_object('botId',bot_a,'kind','swap'));
 IF (SELECT wallet_scope FROM public.execution_submissions WHERE id=submission)<>a THEN RAISE EXCEPTION 'Journal lost wallet identity'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.execution_submissions(id,user_id,lock_owner,tx_hash,nonce,intent)
 VALUES(gen_random_uuid(),u,lock_a,'0x'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),1,jsonb_build_object('botId',bot_b)); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%Bot wallet mismatch%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Cross-wallet journal intent accepted'; END IF;
 PERFORM public.complete_execution_submission(submission,jsonb_build_object('side','compra','status','confirmada','wallet',(SELECT address FROM public.bot_wallets WHERE user_id=u AND wallet_scope=a),'token',t,'source','robo','pair_address',t,'amount_in','1','amount_out_min','1','quoted_out','1','slippage_pct',1,'deadline',1,'block_number',1,'accounting_status','estimado'),'{"strat_state":{"tokens":5}}','{}');
 IF (SELECT wallet_scope FROM public.orders WHERE tx_hash=(SELECT tx_hash FROM public.execution_submissions WHERE id=submission))<>a THEN RAISE EXCEPTION 'Receipt history lost wallet identity'; END IF;
 PERFORM public.complete_execution_submission(submission,NULL,'{}','{}');
 IF (SELECT (strat_state->>'tokens')::int FROM public.grid_bots WHERE id=bot_a)<>5 OR (SELECT strat_state->>'tokens' FROM public.grid_bots WHERE id=bot_b) IS NOT NULL THEN RAISE EXCEPTION 'Receipt changed other wallet position'; END IF;
 rejected:=false;
 BEGIN DELETE FROM public.user_wallets WHERE id=a; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Execution wallet identity deleted'; END IF;
 IF has_function_privilege('authenticated','public.save_user_strategy_scoped(uuid,text,jsonb,text,integer,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.bot_wallets','SELECT') THEN RAISE EXCEPTION 'Private execution access exposed'; END IF;
 -- RLS: owning one wallet never grants access to another user's rows.
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF (SELECT count(*) FROM public.user_wallets WHERE id IN (a,b,foreign_scope))<>2 THEN RAISE EXCEPTION 'Wallet RLS failed'; END IF;
 IF (SELECT count(*) FROM public.grid_bots WHERE id IN (bot_a,bot_b))<>2 THEN RAISE EXCEPTION 'Bot own rows invisible'; END IF;
 EXECUTE 'RESET ROLE';
END $$;
