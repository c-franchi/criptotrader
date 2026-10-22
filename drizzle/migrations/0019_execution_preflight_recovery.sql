-- Only attempts explicitly created as preflight can be recovered without a receipt.
-- Existing locks remain unknown until individually investigated.
ALTER TABLE public.bot_execution_locks ADD COLUMN phase text NOT NULL DEFAULT 'unknown'
 CHECK (phase IN ('unknown','preparing','submitted'));

-- Serialize journal registration against recovery. A resumed expired worker cannot broadcast:
-- submitTransaction always commits this insert before calling sendRawTransaction.
CREATE OR REPLACE FUNCTION public.stamp_submission_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE scope_id uuid;
BEGIN
 SELECT wallet_scope INTO scope_id FROM public.bot_execution_locks
 WHERE user_id=NEW.user_id AND owner=NEW.lock_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Execution owner mismatch'; END IF;
 NEW.wallet_scope:=scope_id;
 IF NEW.intent ? 'botId' AND NOT EXISTS(SELECT 1 FROM public.grid_bots WHERE id=(NEW.intent->>'botId')::uuid AND user_id=NEW.user_id AND wallet_scope=scope_id) THEN RAISE EXCEPTION 'Bot wallet mismatch'; END IF;
 UPDATE public.bot_execution_locks SET phase='submitted' WHERE user_id=NEW.user_id AND owner=NEW.lock_owner;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_submission_scope() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.recover_preflight_execution(p_user uuid,p_scope uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE held public.bot_execution_locks;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_scope::text,0));
 SELECT * INTO held FROM public.bot_execution_locks WHERE user_id=p_user AND wallet_scope=p_scope FOR UPDATE;
 IF NOT FOUND OR held.phase<>'preparing' OR held.acquired_at>now()-interval '15 minutes' THEN RETURN false; END IF;
 -- Any journal entry, including a completed approval, requires the receipt reconciler.
 IF EXISTS(SELECT 1 FROM public.execution_submissions WHERE lock_owner=held.owner)
 OR EXISTS(SELECT 1 FROM public.execution_submissions WHERE user_id=p_user AND wallet_scope=p_scope AND finished_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.orders WHERE user_id=p_user AND wallet_scope=p_scope AND status='enviada') THEN RETURN false; END IF;
 DELETE FROM public.bot_execution_locks WHERE user_id=p_user AND wallet_scope=p_scope AND owner=held.owner;
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_user,'execution_preflight_recovered',jsonb_build_object('wallet_scope',p_scope,'lock_owner',held.owner,'acquired_at',held.acquired_at,'reason','Expired preflight; no journal registration; old worker fenced before broadcast'));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.recover_preflight_execution(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_preflight_execution(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
