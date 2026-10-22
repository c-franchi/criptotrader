-- Removal from active screens preserves the row for receipt reconciliation and audit.
ALTER TABLE public.grid_bots ADD COLUMN archived_at timestamptz;
CREATE FUNCTION public.guard_bot_archive() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A late receipt must remain visible even after a paused bot was removed.
 IF OLD.archived_at IS NOT NULL AND NEW.strat_state IS DISTINCT FROM OLD.strat_state AND (coalesce((NEW.strat_state->>'tokens')::numeric,0)>0 OR coalesce((NEW.strat_state->>'costBnb')::numeric,0)>0) THEN
  NEW.archived_at:=NULL; NEW.armed:=false;
 END IF;
 IF NEW.archived_at IS NOT NULL AND NEW.armed THEN RAISE EXCEPTION 'Robô removido não pode permanecer ligado'; END IF;
 IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':'||NEW.wallet_scope::text,0));
  IF OLD.armed THEN RAISE EXCEPTION 'Pause o robô antes de remover'; END IF;
  IF coalesce((OLD.strat_state->>'tokens')::numeric,0)>0 OR coalesce((OLD.strat_state->>'costBnb')::numeric,0)>0 THEN RAISE EXCEPTION 'Há posição aberta. Remover o robô não vende ativos'; END IF;
  IF EXISTS(SELECT 1 FROM public.execution_submissions WHERE user_id=NEW.user_id AND wallet_scope=NEW.wallet_scope AND finished_at IS NULL) THEN RAISE EXCEPTION 'Há transação pendente nesta carteira. Aguarde a conciliação'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_bot_archive() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_bot_archive BEFORE UPDATE ON public.grid_bots FOR EACH ROW EXECUTE FUNCTION public.guard_bot_archive();
CREATE FUNCTION public.remove_paused_bot(p_user uuid,p_scope uuid,p_bot uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.grid_bots;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT * INTO b FROM public.grid_bots WHERE id=p_bot AND user_id=p_user AND wallet_scope=p_scope FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Robô não encontrado nesta carteira'; END IF;
 IF b.archived_at IS NOT NULL THEN RETURN; END IF;
 -- Trigger checks armed state, open position and pending submissions atomically.
 UPDATE public.grid_bots SET archived_at=now(),updated_at=now() WHERE id=b.id;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'bot_removed',jsonb_build_object('bot',to_jsonb(b),'wallet_preserved',true,'execution_locks_preserved',true));
END $$;
REVOKE ALL ON FUNCTION public.remove_paused_bot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_paused_bot(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
