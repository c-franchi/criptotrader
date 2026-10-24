import { useEffect, useState } from "react";

const shownThisSession = new Set<string>();

/** A display preference only: never writes account, wallet or trading settings. */
export function useAppTour(userId: string | undefined, enabled: boolean) {
  const [open, setOpen] = useState(false);
  const key = `cryptobot:tour:v1:${userId ?? "visitor"}`;
  useEffect(() => {
    if (!enabled || shownThisSession.has(key)) return;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* An in-memory marker still prevents repeated popups. */
    }
    const timer = setTimeout(() => {
      // Do not cover an existing login, configuration, or confirmation dialog.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]'))
        return;
      shownThisSession.add(key);
      try {
        localStorage.setItem(key, "seen");
      } catch {
        /* session fallback above */
      }
      setOpen(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [enabled, key]);
  return {
    open,
    setOpen: (next: boolean) => {
      if (next) {
        shownThisSession.add(key);
        try {
          localStorage.setItem(key, "seen");
        } catch {
          /* session fallback */
        }
      }
      setOpen(next);
    },
  };
}
