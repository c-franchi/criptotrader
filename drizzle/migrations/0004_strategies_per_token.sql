ALTER TABLE public.strategies ADD COLUMN token text NOT NULL DEFAULT '0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA';
ALTER TABLE public.strategies DROP CONSTRAINT IF EXISTS strategies_user_id_key;
ALTER TABLE public.strategies ADD CONSTRAINT strategies_user_token_key UNIQUE (user_id, token);