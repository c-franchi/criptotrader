CREATE TABLE public.bot_execution_locks (user_id uuid PRIMARY KEY, owner uuid NOT NULL, acquired_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot_execution_locks TO service_role;
ALTER TABLE public.bot_execution_locks ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.guard_bot_strategy_edit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF EXISTS (SELECT 1 FROM public.bot_execution_locks WHERE user_id = NEW.user_id) THEN RAISE EXCEPTION 'Execução em andamento: aguarde a confirmação antes de alterar.'; END IF;
IF TG_TABLE_NAME = 'strategies' AND TG_OP = 'UPDATE' THEN
 IF NEW.config IS DISTINCT FROM OLD.config AND EXISTS (SELECT 1 FROM public.grid_bots WHERE user_id = NEW.user_id AND lower(token) = lower(NEW.token) AND coalesce((strat_state->>'tokens')::numeric,0) > 0) THEN RAISE EXCEPTION 'Posição aberta: mantenha a configuração do ciclo até encerrar a posição.'; END IF;
END IF;
RETURN NEW;
END $$;
CREATE TRIGGER guard_strategy_during_execution BEFORE INSERT OR UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.guard_bot_strategy_edit();
COMMENT ON TABLE public.bot_execution_locks IS 'Wallet-wide execution mutex. Retain lock on an unresolved transaction; no automatic expiry or retry.';