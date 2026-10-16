CREATE TABLE public.price_candles (
  pool text NOT NULL,
  token text NOT NULL,
  candles jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool, token)
);
GRANT ALL ON public.price_candles TO service_role;
ALTER TABLE public.price_candles ENABLE ROW LEVEL SECURITY;