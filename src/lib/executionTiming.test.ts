import { expect, it, vi } from "vitest";
import { ExecutionClock, timingDuration } from "./executionTiming";
import { recordExecutionProgress } from "./executionTiming.server";
it("records observed stages without inventing an unobserved touch or network confirmation", () => {
  let now = 1000;
  const c = new ExecutionClock("bot", "scope", "token", "schedule", () => now);
  now = 1300;
  c.mark("signalDetected");
  now = 1600;
  c.mark("broadcastAttempted");
  const s = c.snapshot();
  expect(timingDuration(s, "signalDetected", "broadcastAttempted")).toBe(300);
  expect(timingDuration(s, "broadcastAttempted", "receiptObserved")).toBeNull();
  now = 1800;
  c.mark("receiptObserved");
  expect(s.stages.receiptObserved).toBeUndefined();
  expect(timingDuration(c.snapshot(), "broadcastAttempted", "receiptObserved")).toBe(200);
});
it("does not turn a diagnostic storage outage into a trading failure", async () => {
  const c = new ExecutionClock("bot", "scope", "token");
  const admin = {
    from: vi.fn(() => {
      throw new Error("storage offline");
    }),
  };
  await expect(recordExecutionProgress(admin, "user", c, "sent", "hash")).resolves.toBeUndefined();
});
it("does not reuse an approval's uncertain send or receipt timestamp for the subsequent swap", () => {
  let time = 1000;
  const c = new ExecutionClock("bot", "scope", "token", "schedule", () => time);
  c.mark("signalDetected");
  c.beginTransaction();
  c.mark("broadcastUncertain");
  time = 1500;
  c.mark("receiptObserved");
  c.beginTransaction();
  expect(c.snapshot().stages.broadcastUncertain).toBeUndefined();
  expect(c.snapshot().stages.receiptObserved).toBeUndefined();
  expect(c.snapshot().stages.signalDetected).toBe(1000);
});
