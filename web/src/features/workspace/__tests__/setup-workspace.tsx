import { vi } from "vitest";
import { useWorkspaceStore } from "@/stores/workspace";

/** Estado compartido por las pruebas del workspace: URL simulada y media queries de escritorio. */
export const nav = { search: "", replace: vi.fn() };

export function mockDesktop(matches = true) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width") ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

export function resetWorkspace(search = "") {
  nav.search = search;
  nav.replace.mockClear();
  useWorkspaceStore.getState().reset();
  mockDesktop();
}
