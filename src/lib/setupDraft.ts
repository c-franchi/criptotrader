import type { GuidedInput } from "./guidedBot";

type Form = Omit<GuidedInput, "taxConfirmed"> & { taxConfirmed: boolean };
export type SetupDraft = {
  form: Form;
  step: number;
  currency: "BNB" | "BRL";
  version: number;
  revision: number;
};
export const setupDraftKey = (userId: string, scope: string, token: string) =>
  userId ? `bot-setup:v1:${userId}:${scope}:${token.toLowerCase()}` : "";

/** Incomplete input is allowed; this is never execution authorization or server state. */
export function readSetupDraft(key: string, defaults: Form): SetupDraft | null {
  if (!key) return null;
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      !d ||
      !d.form ||
      !["dca", "grid", "recovery"].includes(d.form.model) ||
      typeof d.form.taxConfirmed !== "boolean" ||
      !["BNB", "BRL"].includes(d.currency) ||
      !Number.isInteger(d.step) ||
      d.step < 0 ||
      d.step > 3 ||
      !Number.isInteger(d.version) ||
      d.version < 0 ||
      !Number.isInteger(d.revision) ||
      d.revision < 0
    )
      return null;
    for (const [field, value] of Object.entries(defaults)) {
      if (
        !(d.form[field] === undefined && ["minLiquidityUsd", "maxGasGwei"].includes(field)) &&
        typeof value === "number" &&
        (typeof d.form[field] !== "number" || !Number.isFinite(d.form[field]))
      )
        return null;
    }
    // Only copy known form fields. No saved/start flags, acknowledgments or wallet state.
    const form = Object.fromEntries(
      Object.keys(defaults).map((k) => [k, d.form[k] ?? defaults[k as keyof Form]]),
    ) as Form;
    return { form, step: d.step, currency: d.currency, version: d.version, revision: d.revision };
  } catch {
    return null;
  }
}
export function writeSetupDraft(key: string, draft: SetupDraft): boolean {
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
export function removeSetupDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Closing must work with storage disabled. */
  }
}
