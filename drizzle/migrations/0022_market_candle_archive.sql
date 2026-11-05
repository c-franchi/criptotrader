-- Persistent five-minute OHLCV archive. All records must come from the real market provider.
-- No user wallet information, secrets or trading positions are stored in these tables.
CREATE TABLE IF NOT EXISTS public.market_candle_bars (
  pool text NOT NULL CHECK (pool ~ '^0x[0-9a-f]{40}$'),
  token text NOT NULL CHECK (token ~ '^0x[0-9a-f]{40}$'),
  ts bigint NOT NULL CHECK (ts > 0),
  candle jsonb NOT NULL CHECK (jsonb_typeof(candle) = 'array' AND jsonb_array_length(candle) >= 5),
  stored_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool, token, ts)
);
CREATE INDEX IF NOT EXISTS market_candle_bars_recent_idx ON public.market_candle_bars (pool, token, ts DESC);
ALTER TABLE public.market_candle_bars ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_candle_bars FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.market_candle_bars TO service_role;

CREATE TABLE IF NOT EXISTS public.market_candle_watch (
  pool text NOT NULL CHECK (pool ~ '^0x[0-9a-f]{40}$'),
  token text NOT NULL CHECK (token ~ '^0x[0-9a-f]{40}$'),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_candle_at bigint,
  backfill_before bigint,
  backfill_complete boolean NOT NULL DEFAULT false,
  last_error text,
  PRIMARY KEY (pool, token)
);
CREATE INDEX IF NOT EXISTS market_candle_watch_due_idx ON public.market_candle_watch (next_run_at, last_seen_at DESC);
ALTER TABLE public.market_candle_watch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_candle_watch FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.market_candle_watch TO service_role;

CREATE TABLE IF NOT EXISTS public.market_candle_heartbeat (
  id integer PRIMARY KEY CHECK (id = 1),
  last_invoked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  claimed integer NOT NULL DEFAULT 0,
  saved integer NOT NULL DEFAULT 0,
  backfilled integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0
);
ALTER TABLE public.market_candle_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_candle_heartbeat FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.market_candle_heartbeat TO service_role;

CREATE OR REPLACE FUNCTION public.watch_market_candle_pair(p_pool text, p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pool text := lower(p_pool); v_token text := lower(p_token);
BEGIN
  IF v_pool !~ '^0x[0-9a-f]{40}$' OR v_token !~ '^0x[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'Invalid BSC market address';
  END IF;
  INSERT INTO public.market_candle_watch(pool, token) VALUES (v_pool, v_token)
  ON CONFLICT (pool, token) DO UPDATE SET last_seen_at = now();
END $$;
REVOKE ALL ON FUNCTION public.watch_market_candle_pair(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.watch_market_candle_pair(text,text) TO service_role;

-- Atomic lease: serverless invocations may overlap. Claim only 2 watched markets/minute.
CREATE OR REPLACE FUNCTION public.claim_market_candle_pairs(p_limit integer DEFAULT 2)
RETURNS TABLE(pool text, token text, backfill_before bigint, backfill_complete boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT w.pool, w.token
    FROM public.market_candle_watch w
    WHERE w.next_run_at <= now()
    ORDER BY w.next_run_at, w.last_seen_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 2)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.market_candle_watch w
    SET next_run_at = now() + interval '5 minutes',
        last_attempt_at = now()
    FROM due
    WHERE w.pool = due.pool AND w.token = due.token
    RETURNING w.pool, w.token, w.backfill_before, w.backfill_complete;
END $$;
REVOKE ALL ON FUNCTION public.claim_market_candle_pairs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_market_candle_pairs(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
