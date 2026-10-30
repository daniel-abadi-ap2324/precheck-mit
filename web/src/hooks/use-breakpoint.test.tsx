import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { BREAKPOINTS, useBreakpoint } from "./use-breakpoint";

describe("useBreakpoint", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("una sola escala, la de Tailwind: md 768, lg 1024, xl 1280", () => {
    expect(BREAKPOINTS).toEqual({ md: 768, lg: 1024, xl: 1280 });
  });

  it("consulta min-width del punto de corte", () => {
    const consultas: string[] = [];
    vi.stubGlobal("matchMedia", (q: string) => {
      consultas.push(q);
      return { matches: q === "(min-width: 1024px)", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    });
    expect(renderHook(() => useBreakpoint("lg")).result.current).toBe(true);
    expect(renderHook(() => useBreakpoint("xl")).result.current).toBe(false);
    expect(consultas).toContain("(min-width: 1280px)");
  });
});
