-- Synthetic records, ONLY in disposable rehearsal. No signing or network calls.
DO $$
DECLARE u uuid:=gen_random_uuid(); sale uuid:=gen_random_uuid(); manual_id uuid:=gen_random_uuid(); rejected boolean:=false; n integer;
BEGIN
 IF NOT (SELECT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.queue_sale_accounting()'::regprocedure) THEN RAISE EXCEPTION 'Queue trigger privilege/search path mismatch'; END IF;
 IF has_table_privilege('authenticated','public.order_accounting_retry','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Queue exposed'; END IF;
 IF has_table_privilege('anon','public.order_accounting_retry','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Anonymous queue access'; END IF;
 IF has_function_privilege('authenticated','public.claim_order_accounting(integer)','EXECUTE') THEN RAISE EXCEPTION 'Queue lease exposed'; END IF;
 EXECUTE 'SET LOCAL ROLE service_role';
 INSERT INTO public.orders(id,user_id,side,status,wallet,amount_in,amount_out_min,quoted_out,slippage_pct,deadline,source)
 VALUES(sale,u,'venda','confirmada','0x1111111111111111111111111111111111111111','1','1','1',1,1,'robo');
 SELECT count(*) INTO n FROM public.order_accounting_retry WHERE order_id=sale;
 IF n<>1 THEN RAISE EXCEPTION 'Sale not queued exactly once'; END IF;
 UPDATE public.orders SET status='confirmada' WHERE id=sale;
 SELECT count(*) INTO n FROM public.order_accounting_retry WHERE order_id=sale;
 IF n<>1 THEN RAISE EXCEPTION 'Duplicate queue item'; END IF;
 PERFORM public.claim_order_accounting(2);
 IF (SELECT attempts FROM public.order_accounting_retry WHERE order_id=sale)<>1 THEN RAISE EXCEPTION 'Lease not incremented'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_order_accounting(2)) THEN RAISE EXCEPTION 'Lease repeated before due'; END IF;
 -- Synthetic accounting evidence only, NOT a real sale or inferred WBNB receipt.
 UPDATE public.orders SET actual_bnb_received=1 WHERE id=sale;
 IF (SELECT resolved_at IS NULL FROM public.order_accounting_retry WHERE order_id=sale) THEN RAISE EXCEPTION 'Queue not resolved'; END IF;
 PERFORM public.watch_market_candle_pair('0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222');
 SELECT count(*) INTO n FROM public.claim_market_candle_pairs(2); IF n<>1 THEN RAISE EXCEPTION 'Market claim failure'; END IF;
 SELECT count(*) INTO n FROM public.claim_market_candle_pairs(2); IF n<>0 THEN RAISE EXCEPTION 'Market lease duplicated'; END IF;
 INSERT INTO public.market_candle_bars(pool,token,ts,candle) VALUES('0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222',1,'[1,1,1,1,1]');
 INSERT INTO public.market_candle_heartbeat(id,saved) VALUES(1,1);
 INSERT INTO public.accounting_worker_heartbeat(id,verified) VALUES(1,1);
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO public.orders(id,user_id,side,wallet,amount_in,amount_out_min,quoted_out,slippage_pct,deadline)
 VALUES(manual_id,u,'venda','0x1111111111111111111111111111111111111111','1','1','1',1,1);
 UPDATE public.orders SET status='enviada' WHERE id=manual_id;
 BEGIN INSERT INTO public.order_accounting_retry(order_id,user_id) VALUES(manual_id,u); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Authenticated queue insert accepted'; END IF;
 rejected:=false;
 BEGIN UPDATE public.order_accounting_retry SET attempts=99 WHERE order_id=sale; EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Authenticated queue update accepted'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.audit_log(user_id,action) VALUES(u,'order_native_proceeds_confirmed'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Client financial proof accepted'; END IF;
 rejected:=false;
 BEGIN UPDATE public.orders SET status='confirmada' WHERE id=manual_id; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Client confirmation accepted'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.order_accounting_retry WHERE order_id=manual_id) THEN RAISE EXCEPTION 'Manual sale queued'; END IF;
END $$;