import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { mockDesktop, nav, resetWorkspace } from "./setup-workspace";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/projects/prj-betania-01/precheck",
}));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <hr />,
}));

const { PreCheckWorkspace } = await import("../components/precheck-workspace");
const renderWorkspace = () => renderWithProviders(<PreCheckWorkspace projectId="prj-betania-01" />);

describe("acciones de revisión", () => {
  beforeEach(() => {
    resetWorkspace();
    toast.success.mockClear();
  });

  it("valida y guarda un comentario", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Agregar comentario" }));
    await user.click(screen.getByRole("button", { name: "Guardar comentario" }));
    expect(await screen.findByText("Escriba al menos 3 caracteres.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Comentario" }), "Verificar la línea de construcción");
    await user.click(screen.getByRole("button", { name: "Guardar comentario" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Comentario agregado", { description: "PLOT-RM-2-RETIROS" }));
    // Escribir un comentario largo con userEvent tarda más de 5 s cuando el equipo está ocupado.
  }, 15_000);

  it("marca la regla para revisión", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const button = await screen.findByRole("button", { name: "Marcar para revisión" });
    await user.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "Marcada para revisión" })).toHaveAttribute("aria-pressed", "true"));
    expect(toast.success).toHaveBeenCalledWith("Regla marcada para revisión", { description: "PLOT-RM-2-RETIROS" });
  });
});

describe("móvil", () => {
  beforeEach(() => {
    resetWorkspace();
    mockDesktop(false);
  });

  it("muestra un solo panel y pasa al plano al elegir una regla", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("option", { name: /A110-AIV-RAMPA-DOBLE/ }));
    expect(screen.queryByRole("heading", { name: "Resultados del PreCheck" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Lámina A-101/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Detalle" }));
    expect(document.getElementById("rule-details-title")).toHaveTextContent("Rampa vehicular de doble sentido");
    expect(screen.queryByRole("img", { name: /Lámina A-101/ })).not.toBeInTheDocument();
  });
});
