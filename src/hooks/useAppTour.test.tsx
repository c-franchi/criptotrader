import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAppTour } from "./useAppTour";
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const settle = () =>
  act(() => {
    vi.advanceTimersByTime(500);
  });
it("automatically displays once per account/device, with manual reopening still available", () => {
  const first = renderHook(() => useAppTour("first-account", true));
  settle();
  expect(first.result.current.open).toBe(true);
  expect(localStorage.getItem("cryptobot:tour:v1:first-account")).toBe("seen");
  act(() => first.result.current.setOpen(false));
  first.unmount();
  const next = renderHook(() => useAppTour("first-account", true));
  settle();
  expect(next.result.current.open).toBe(false);
  act(() => next.result.current.setOpen(true));
  expect(next.result.current.open).toBe(true);
  const other = renderHook(() => useAppTour("second-account", true));
  settle();
  expect(other.result.current.open).toBe(true);
});
it("waits for authentication and does not cover another configuration or confirmation dialog", () => {
  const view = renderHook(({ enabled }) => useAppTour("busy-account", enabled), {
    initialProps: { enabled: false },
  });
  settle();
  expect(view.result.current.open).toBe(false);
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div id="other-modal" role="dialog" data-state="open"></div>',
  );
  view.rerender({ enabled: true });
  settle();
  expect(view.result.current.open).toBe(false);
  expect(localStorage.getItem("cryptobot:tour:v1:busy-account")).toBeNull();
  document.getElementById("other-modal")?.remove();
});
it("does not repeat automatically on navigation when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("denied");
  });
  const first = renderHook(() => useAppTour("private-browser-account", true));
  settle();
  expect(first.result.current.open).toBe(true);
  first.unmount();
  const next = renderHook(() => useAppTour("private-browser-account", true));
  settle();
  expect(next.result.current.open).toBe(false);
});

it("remembers a tour opened manually even before automatic onboarding is enabled", () => {
  const view = renderHook(({ enabled }) => useAppTour("manual-first-account", enabled), {
    initialProps: { enabled: false },
  });
  act(() => view.result.current.setOpen(true));
  act(() => view.result.current.setOpen(false));
  view.rerender({ enabled: true });
  settle();
  expect(view.result.current.open).toBe(false);
  expect(localStorage.getItem("cryptobot:tour:v1:manual-first-account")).toBe("seen");
});
