import { afterEach, beforeEach, expect, it, vi } from "vitest";
let handlers: Record<string, (event: Event) => void>;
let installedMode = false;
beforeEach(() => {
  vi.resetModules();
  handlers = {};
  installedMode = false;
  vi.spyOn(window, "addEventListener").mockImplementation((type, handler) => {
    handlers[type] = handler as (event: Event) => void;
  });
  vi.spyOn(window, "matchMedia").mockImplementation(
    () => ({ matches: installedMode, addEventListener: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
});
function available(outcome: Promise<{ outcome: string }>, prompt = vi.fn(async () => {})) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice: outcome });
  handlers["beforeinstallprompt"]!(event);
  expect(event.defaultPrevented).toBe(true);
  return prompt;
}
it("opens the native prompt immediately and distinguishes acceptance from installation confirmation", async () => {
  const api = await import("./installPrompt");
  const notify = vi.fn();
  api.subscribeInstall(notify);
  const prompt = available(Promise.resolve({ outcome: "accepted" }));
  const result = api.runInstall();
  expect(prompt).toHaveBeenCalledOnce();
  expect(api.getInstallState().prompting).toBe(true);
  expect(await result).toBe(true);
  expect(api.getInstallState()).toMatchObject({
    accepted: true,
    installed: false,
    canInstall: false,
  });
  handlers["appinstalled"]!(new Event("appinstalled"));
  expect(api.getInstallState()).toMatchObject({
    accepted: false,
    installed: true,
    canInstall: false,
  });
  expect(notify).toHaveBeenCalled();
});
it("consumes each native event once and does not repeat the prompt after double clicks or dismissal", async () => {
  const api = await import("./installPrompt");
  let finish!: (choice: { outcome: string }) => void;
  const prompt = available(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = api.runInstall();
  expect(await api.runInstall()).toBe(false);
  finish({ outcome: "dismissed" });
  expect(await first).toBe(false);
  expect(await api.runInstall()).toBe(false);
  expect(prompt).toHaveBeenCalledOnce();
  expect(api.getInstallState()).toMatchObject({
    installed: false,
    accepted: false,
    prompting: false,
  });
});
it("clears busy state on browser errors and can use a newly offered native event", async () => {
  const api = await import("./installPrompt");
  available(
    Promise.resolve({ outcome: "dismissed" }),
    vi.fn(async () => {
      throw Error("not allowed");
    }),
  );
  await expect(api.runInstall()).rejects.toThrow("not allowed");
  expect(api.getInstallState().prompting).toBe(false);
  available(Promise.resolve({ outcome: "accepted" }));
  expect(await api.runInstall()).toBe(true);
});
it("recognizes an installed iPhone app without displaying another install prompt", async () => {
  Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  const api = await import("./installPrompt");
  expect(api.getInstallState()).toMatchObject({
    installed: true,
    standalone: true,
    canInstall: false,
  });
  expect(await api.runInstall()).toBe(false);
});
