export type TimingStage =
  | "evaluationStarted"
  | "lockAcquired"
  | "configurationLoaded"
  | "marketReady"
  | "historyReady"
  | "signalDetected"
  | "preparationStarted"
  | "prepared"
  | "signed"
  | "journaled"
  | "broadcastAttempted"
  | "broadcastReturned"
  | "broadcastUncertain"
  | "receiptObserved"
  | "finished";
export type TimingSnapshot = {
  runId: string;
  botId: string;
  walletScope: string;
  token: string;
  trigger: "schedule" | "block";
  stages: Partial<Record<TimingStage, number>>;
  elapsedMs: number;
  previousEvaluationAt?: number;
};
export class ExecutionClock {
  private started: number;
  private stages: Partial<Record<TimingStage, number>> = {};
  readonly runId = crypto.randomUUID();
  private previousEvaluationAt: number | undefined;
  setPreviousEvaluation(value: string | null | undefined) {
    const at = value ? Date.parse(value) : NaN;
    if (Number.isFinite(at)) this.previousEvaluationAt = at;
  }
  beginTransaction() {
    for (const key of [
      "preparationStarted",
      "prepared",
      "signed",
      "journaled",
      "broadcastAttempted",
      "broadcastReturned",
      "broadcastUncertain",
      "receiptObserved",
    ] as TimingStage[])
      delete this.stages[key];
    this.mark("preparationStarted");
  }
  constructor(
    readonly botId: string,
    readonly walletScope: string,
    readonly token: string,
    readonly trigger: "schedule" | "block" = "schedule",
    private now = () => Date.now(),
  ) {
    this.started = now();
    this.mark("evaluationStarted");
  }
  mark(stage: TimingStage) {
    this.stages[stage] = this.now();
  }
  snapshot(): TimingSnapshot {
    return {
      runId: this.runId,
      botId: this.botId,
      walletScope: this.walletScope,
      token: this.token,
      trigger: this.trigger,
      stages: { ...this.stages },
      elapsedMs: Math.max(0, this.now() - this.started),
      ...(this.previousEvaluationAt != null
        ? { previousEvaluationAt: this.previousEvaluationAt }
        : {}),
    };
  }
}
export function timingDuration(s: TimingSnapshot, start: TimingStage, end: TimingStage) {
  const a = s.stages[start],
    b = s.stages[end];
  return a != null && b != null && b >= a ? b - a : null;
}
