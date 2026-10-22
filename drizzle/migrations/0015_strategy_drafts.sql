-- Drafts never replace the live configuration and never bypass execution guards.
CREATE TABLE public.strategy_drafts (
 user_id uuid NOT NULL,
 token text NOT NULL CHECK (token ~ '^0x[0-9a-f]{40}$'),
 config jsonb NOT NULL,
 tracked_wallet text,
 base_version integer NOT NULL CHECK (base_version >= 0),
 revision integer NOT NULL CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,token)
);
ALTER TABLE public.strategy_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strategy_drafts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.strategy_drafts TO service_role;

CREATE FUNCTION public.save_strategy_draft(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_base_version integer,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_revision integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT revision INTO old_revision FROM public.strategy_drafts WHERE user_id=p_user AND token=lower(p_token) FOR UPDATE;
 IF coalesce(old_revision,0)<>p_revision THEN RAISE EXCEPTION 'Draft changed'; END IF;
 INSERT INTO public.strategy_drafts(user_id,token,config,tracked_wallet,base_version,revision)
 VALUES(p_user,lower(p_token),p_config,p_wallet,p_base_version,p_revision+1)
 ON CONFLICT(user_id,token) DO UPDATE SET config=EXCLUDED.config,tracked_wallet=EXCLUDED.tracked_wallet,base_version=EXCLUDED.base_version,revision=EXCLUDED.revision,updated_at=now();
 RETURN p_revision+1;
END $$;
REVOKE ALL ON FUNCTION public.save_strategy_draft(uuid,text,jsonb,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_strategy_draft(uuid,text,jsonb,text,integer,integer) TO service_role;

CREATE FUNCTION public.apply_strategy_with_draft(p_user uuid,p_token text,p_config jsonb,p_wallet text,p_version integer,p_draft_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_revision integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT revision INTO current_revision FROM public.strategy_drafts WHERE user_id=p_user AND token=lower(p_token) FOR UPDATE;
 IF coalesce(current_revision,0)<>p_draft_revision THEN RAISE EXCEPTION 'Draft changed'; END IF;
 -- Existing revision, pending-execution, position and wallet guards remain authoritative.
 PERFORM public.save_user_strategy(p_user,p_token,p_config,p_wallet,p_version);
 DELETE FROM public.strategy_drafts WHERE user_id=p_user AND token=lower(p_token) AND revision=p_draft_revision;
END $$;
REVOKE ALL ON FUNCTION public.apply_strategy_with_draft(uuid,text,jsonb,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_strategy_with_draft(uuid,text,jsonb,text,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
