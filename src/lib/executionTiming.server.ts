/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExecutionClock } from "./executionTiming";
const sampled = new Map<string, number>();
export async function recordExecutionProgress(
  admin: any,
  userId: string,
  clock: ExecutionClock,
  phase: string,
  hash?: string,
) {
  try {
    const query = admin.from("audit_log").insert({
      user_id: userId,
      action: "bot_execution_progress",
      details: { ...clock.snapshot(), phase, ...(hash ? { hash } : {}) },
    });
    await (typeof query.abortSignal === "function"
      ? query.abortSignal(AbortSignal.timeout(1000))
      : query);
  } catch {
    /* Journal remains the source of truth if diagnostics fail. */
  }
}
export async function recordEvaluation(admin: any, userId: string, clock: ExecutionClock) {
  const s = clock.snapshot(),
    key = `${userId}:${s.botId}`;
  if (!s.stages.signalDetected && (sampled.get(key) ?? 0) + 60000 > Date.now()) return;
  if (sampled.size > 1000) sampled.clear();
  sampled.set(key, Date.now());
  await recordExecutionProgress(admin, userId, clock, "evaluated");
}
