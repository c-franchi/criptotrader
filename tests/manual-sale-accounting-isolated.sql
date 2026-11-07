-- Run ONLY on a disposable rehearsal database with accounting migration 0023
-- and ops/manual-sale-accounting-queue.sql already installed. Never run on production.
BEGIN;
DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  manual_id uuid := gen_random_uuid();
  robot_id uuid := gen_random_uuid();
  n integer;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.orders
    (id,user_id,source,side,status,wallet,amount_in,amount_out_min,quoted_out,slippage_pct,deadline,tx_hash)
  VALUES
    (manual_id,owner_id,'manual','venda','confirmada',
     '0x1111111111111111111111111111111111111111','1','1','1',1,1,
     '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    (robot_id,owner_id,'robo','venda','confirmada',
     '0x1111111111111111111111111111111111111111','1','1','1',1,1,
     '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

  SELECT count(*) INTO n FROM public.order_accounting_retry
  WHERE order_id IN (manual_id,robot_id) AND resolved_at IS NULL;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected manual AND bot sale in queue, got %',n;
  END IF;

  UPDATE public.orders SET status = 'confirmada' WHERE id IN (manual_id, robot_id);
  SELECT count(*) INTO n FROM public.order_accounting_retry
  WHERE order_id IN (manual_id,robot_id);
  IF n <> 2 THEN RAISE EXCEPTION 'Queue duplicated a sale'; END IF;

  UPDATE public.orders SET actual_bnb_received = 0.001 WHERE id = manual_id;
  IF NOT EXISTS (SELECT 1 FROM public.order_accounting_retry
                 WHERE order_id = manual_id AND resolved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Manually confirmed sale not marked resolved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_accounting_retry
                 WHERE order_id = robot_id AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'Unconfirmed robot sale lost from queue';
  END IF;
  RESET ROLE;
END
$test$;
ROLLBACK;
