-- Reliable background reconciliation queue for confirmed BSC sales.
-- No wallet secret, seed phrase, signed transaction, or forecast is stored here.
CREATE TABLE IF NOT EXISTS public.order_accounting_retry (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_accounting_retry_due_idx
  ON public.order_accounting_retry (next_attempt_at)
  WHERE resolved_at IS NULL;
ALTER TABLE public.order_accounting_retry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_accounting_retry FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_accounting_retry TO service_role;

-- Queue bookkeeping runs under the trusted migration owner because authenticated
-- writers cannot insert into the service-role-only queue. Never grant them direct
-- INSERT/UPDATE access. This trigger has a pinned search_path, qualified tables,
-- and may ONLY touch the accounting retry queue; see release role tests.
-- The execution journal inserts the order before finalization. The trigger
-- queues a sale only when its receipt is confirmed but actual proceeds are NULL.
CREATE OR REPLACE FUNCTION public.queue_sale_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Only the orders trigger may call this narrowly scoped internal queue writer.
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'orders' THEN
    RAISE EXCEPTION 'Accounting trigger invoked outside orders';
  END IF;
  IF NEW.source <> 'manual' AND NEW.side = 'venda' AND
     NEW.status = 'confirmada' AND NEW.actual_bnb_received IS NULL THEN
    INSERT INTO public.order_accounting_retry (order_id, user_id)
      VALUES (NEW.id, NEW.user_id) ON CONFLICT (order_id) DO NOTHING;
  ELSIF NEW.source <> 'manual' AND NEW.side = 'venda' AND
        NEW.status = 'confirmada' AND NEW.actual_bnb_received IS NOT NULL THEN
    UPDATE public.order_accounting_retry SET resolved_at = now()
      WHERE order_id = NEW.id AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_sale_accounting ON public.orders;
CREATE TRIGGER queue_sale_accounting
  AFTER INSERT OR UPDATE OF status,actual_bnb_received ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_sale_accounting();
REVOKE ALL ON FUNCTION public.queue_sale_accounting() FROM PUBLIC,anon,authenticated;

-- Backfill previously confirmed, not-yet-apportioned sales, including GTE.
INSERT INTO public.order_accounting_retry(order_id,user_id)
SELECT o.id,o.user_id FROM public.orders o
WHERE o.source <> 'manual' AND o.side = 'venda'
AND o.status = 'confirmada' AND o.actual_bnb_received IS NULL
ON CONFLICT (order_id) DO NOTHING;

-- Atomic lease across multiple serverless instances. Service-role-only RPC.
CREATE OR REPLACE FUNCTION public.claim_order_accounting(p_limit integer DEFAULT 2)
RETURNS TABLE(order_id uuid, user_id uuid, attempts integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT j.order_id FROM public.order_accounting_retry AS j
    JOIN public.orders AS o ON o.id = j.order_id
    WHERE j.resolved_at IS NULL AND j.next_attempt_at <= now()
      AND o.side='venda' AND o.status='confirmada'
      AND o.actual_bnb_received IS NULL
    ORDER BY j.next_attempt_at, j.created_at
    LIMIT LEAST(GREATEST(p_limit,1),2)
    FOR UPDATE OF j SKIP LOCKED
  )
  UPDATE public.order_accounting_retry AS j
  SET attempts = j.attempts + 1,
      last_attempt_at = now(),
      next_attempt_at = now() + interval '20 minutes'
  FROM due WHERE j.order_id = due.order_id
  RETURNING j.order_id, j.user_id, j.attempts;
END $$;
REVOKE ALL ON FUNCTION public.claim_order_accounting(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_accounting(integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.accounting_worker_heartbeat (
  id integer PRIMARY KEY CHECK(id = 1),
  last_run_at timestamptz NOT NULL DEFAULT now(),
  verified integer NOT NULL DEFAULT 0,
  pending integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0
);
ALTER TABLE public.accounting_worker_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_worker_heartbeat FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accounting_worker_heartbeat TO service_role;

-- Prevent clients from fabricating an append-only proof in the shared audit_log.
CREATE OR REPLACE FUNCTION public.reject_client_financial_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.action = 'order_native_proceeds_confirmed' AND
     current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Financial receipt evidence is server-owned';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reject_client_financial_proof ON public.audit_log;
CREATE TRIGGER reject_client_financial_proof
  BEFORE INSERT ON public.audit_log FOR EACH ROW
  EXECUTE FUNCTION public.reject_client_financial_proof();
REVOKE ALL ON FUNCTION public.reject_client_financial_proof() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
