import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom no implementa estas APIs; los componentes de la interfaz las consultan.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (RO as unknown as typeof ResizeObserver);
// Las pruebas de rutas del servidor corren en entorno node (// @vitest-environment node): sin window ni DOM.
const hayDom = typeof window !== "undefined";
if (hayDom && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
if (hayDom) Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? vi.fn();
