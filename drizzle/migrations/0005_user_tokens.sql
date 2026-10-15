CREATE TABLE public.user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  address text NOT NULL CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  symbol text NOT NULL,
  name text NOT NULL,
  decimals integer NOT NULL CHECK (decimals BETWEEN 0 AND 36),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, address)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tokens TO authenticated;
GRANT ALL ON public.user_tokens TO service_role;
ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own" ON public.user_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());