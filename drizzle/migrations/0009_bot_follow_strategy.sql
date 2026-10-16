ALTER TABLE public.grid_bots ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'estrategia';
ALTER TABLE public.grid_bots ADD COLUMN IF NOT EXISTS strat_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.grid_bots ADD COLUMN IF NOT EXISTS last_reason text;
ALTER TABLE public.grid_bots ALTER COLUMN lower_price SET DEFAULT 0;
ALTER TABLE public.grid_bots ALTER COLUMN upper_price SET DEFAULT 0;
ALTER TABLE public.grid_bots ALTER COLUMN order_bnb SET DEFAULT 0;
UPDATE public.grid_bots SET mode = 'grade' WHERE upper_price > 0;