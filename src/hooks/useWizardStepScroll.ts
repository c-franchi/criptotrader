import { useEffect, useRef, type RefObject } from "react";

/** A wizard step must start at its own top, including inside a portaled scrollable modal. */
export function useWizardStepScroll(
  step: number,
  saved: boolean,
): RefObject<HTMLDivElement | null> {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef({ step, saved });
  useEffect(() => {
    if (previous.current.step === step && previous.current.saved === saved) return;
    previous.current = { step, saved };
    const frame = requestAnimationFrame(() => {
      const element = root.current;
      if (!element) return;
      let parent = element.parentElement;
      while (parent && parent !== document.documentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
          parent.scrollTo({ top: 0, behavior: "instant" });
          element.focus({ preventScroll: true });
          return;
        }
        parent = parent.parentElement;
      }
      window.scrollTo({ top: 0, behavior: "instant" });
      element.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, saved]);
  return root;
}
