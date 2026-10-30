import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { toast } from "sonner";
import { Toaster } from "./sonner";

describe("Toaster", () => {
  it("usa siempre el tema claro de la app, aunque el sistema operativo esté en modo oscuro", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
    const { container } = render(<Toaster />);
    act(() => void toast("Hola"));
    await new Promise((r) => setTimeout(r, 50));
    const lista = container.ownerDocument.querySelector("[data-sonner-toaster]");
    expect(lista?.getAttribute("data-sonner-theme")).toBe("light");
    vi.unstubAllGlobals();
  });
});
