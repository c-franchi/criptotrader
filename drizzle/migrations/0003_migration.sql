CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.internal_tokens (
  name text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);
GRANT ALL ON public.internal_tokens TO service_role;
ALTER TABLE public.internal_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_tokens (name) VALUES ('grid_tick');