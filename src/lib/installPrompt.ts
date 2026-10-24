// Keep the native event so a click in the menu or install page can open it immediately.
export type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
let confirmed = false;
let prompting = false;
let accepted = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone);
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIP;
    confirmed = false;
    accepted = false;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    confirmed = true;
    accepted = false;
    deferred = null;
    emit();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", emit);
}
export const getInstallState = () => ({
  canInstall: !!deferred && !prompting && !standalone(),
  installed: confirmed || standalone(),
  standalone: standalone(),
  prompting,
  accepted,
});
export function subscribeInstall(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
/** Must start in a user click; do not await navigation before calling prompt().
 * Acceptance is distinct from the browser's appinstalled confirmation. */
export async function runInstall(): Promise<boolean> {
  if (!deferred || prompting || standalone()) return false;
  const event = deferred;
  deferred = null; // a native event can be consumed only once
  prompting = true;
  emit();
  try {
    await event.prompt();
    accepted = (await event.userChoice).outcome === "accepted" && !confirmed;
    return accepted || confirmed;
  } finally {
    prompting = false;
    emit();
  }
}
