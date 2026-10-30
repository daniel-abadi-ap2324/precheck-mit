import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { useMediaQuery } from "./use-media-query";

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const state = { matches: initial };
  const addEventListener = vi.fn((_: string, cb: () => void) => listeners.add(cb));
  const removeEventListener = vi.fn((_: string, cb: () => void) => listeners.delete(cb));
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    get matches() {
      return state.matches;
    },
    media,
    addEventListener,
    removeEventListener,
  }));
  return {
    addEventListener,
    set(matches: boolean) {
      state.matches = matches;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useMediaQuery", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("devuelve si la media query coincide y se actualiza al cambiar", () => {
    const mq = fakeMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)", true));
    expect(result.current).toBe(false);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
  });

  it("no vuelve a suscribirse en cada render (subscribe estable)", () => {
    const mq = fakeMatchMedia(true);
    const { rerender } = renderHook(() => useMediaQuery("(min-width: 1024px)", true));
    rerender();
    rerender();
    expect(mq.addEventListener).toHaveBeenCalledTimes(1);
  });

  it("en el servidor devuelve el serverValue explícito", () => {
    function Probe({ serverValue }: { serverValue: boolean }) {
      return createElement("span", null, String(useMediaQuery("(min-width: 1024px)", serverValue)));
    }
    expect(renderToString(createElement(Probe, { serverValue: false }))).toContain("false");
    expect(renderToString(createElement(Probe, { serverValue: true }))).toContain("true");
  });
});
