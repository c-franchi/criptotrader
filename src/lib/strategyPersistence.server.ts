import { strategySaveRestriction } from "./strategySave";
import type { Json } from "@/integrations/supabase/types";
export type StrategyRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export async function persistStrategy(
  admin: StrategyRpcClient,
  userId: string,
  data: {
    token: string;
    config: Json;
    wallet: string | null;
    version: number;
    draftRevision: number;
  },
) {
  const { error } = await admin.rpc("apply_strategy_with_draft", {
    p_user: userId,
    p_token: data.token,
    p_config: data.config,
    p_wallet: data.wallet,
    p_version: data.version,
    p_draft_revision: data.draftRevision,
  });
  if (!error)
    return {
      status: "applied" as const,
      version: data.version + 1,
      draftRevision: 0,
      message: "Estratégia aplicada",
    };
  const restriction = strategySaveRestriction(error.message);
  if (restriction.kind === "unavailable" || restriction.kind === "draft_conflict")
    throw new Error(restriction.text);
  const { data: revision, error: draftError } = await admin.rpc("save_strategy_draft", {
    p_user: userId,
    p_token: data.token,
    p_config: data.config,
    p_wallet: data.wallet,
    p_base_version: data.version,
    p_revision: data.draftRevision,
  });
  if (draftError) throw new Error(strategySaveRestriction(draftError.message).text);
  return {
    status: "draft" as const,
    version: data.version,
    draftRevision: Number(revision),
    message: restriction.text,
  };
}
