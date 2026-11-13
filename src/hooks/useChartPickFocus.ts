import { useEffect, useRef } from "react";

/** A pending pick is an instruction, not a network spinner. Reveal the chart inside its modal. */
export function useChartPickFocus(pickKey: string | null, confirmationOpen: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickKey || confirmationOpen) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
      ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pickKey, confirmationOpen]);
  return ref;
}
