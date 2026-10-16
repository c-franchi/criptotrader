// Captures the browser's native install event once, so any screen can trigger the real install.
export type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: BIP | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

if (typeof window !== "undefined") {
  installed = window.matchMedia("(display-mode: standalone)").matches;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIP; emit(); });
  window.addEventListener("appinstalled", () => { installed = true; deferred = null; emit(); });
}

export const getInstallState = () => ({ canInstall: !!deferred, installed });
export function subscribeInstall(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

/** Opens the browser's own install window. Returns true if the user accepted. */
export async function runInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const ok = (await e.userChoice).outcome === "accepted";
  if (ok) installed = true;
  emit();
  return ok;
}
