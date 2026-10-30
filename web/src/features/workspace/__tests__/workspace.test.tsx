import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { nav, resetWorkspace } from "./setup-workspace";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/projects/prj-betania-01/precheck",
}));

// jsdom no tiene geometría: react-resizable-panels toma cualquier clic como arrastre del separador.
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <hr />,
}));

const { PreCheckWorkspace } = await import("../components/precheck-workspace");

const renderWorkspace = () => renderWithProviders(<PreCheckWorkspace projectId="prj-betania-01" />);
const planSvg = () => screen.getByRole("img", { name: /Lámina A-101/ });

describe("PreCheckWorkspace", { timeout: 15_000 }, () => {
  beforeEach(() => resetWorkspace());

  it("selecciona por defecto la primera regla que no cumple y resalta su cota en el plano", async () => {
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "Resultados del PreCheck" })).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById("rule-details-title")).toHaveTextContent("RM-2: retiros frontal, lateral y posterior"));
    expect(within(planSvg()).getByText(/4\.25 m/)).toBeInTheDocument();
    expect(planSvg()).toHaveAccessibleName(/Resaltado de «RM-2: retiros/);
    expect(screen.getByRole("option", { name: /PLOT-RM-2-RETIROS/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("rule=PLOT-RM-2-RETIROS"), { scroll: false }));
  });

  it("muestra los contadores y filtra por estado y por búsqueda", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findAllByRole("option");
    expect(screen.getAllByRole("option")).toHaveLength(52);
    await user.click(screen.getByRole("button", { name: /No cumple\s*7/ }));
    expect(screen.getAllByRole("option")).toHaveLength(7);
    expect(screen.getByText("Mostrando 7 de 52 reglas")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: /Buscar regla/ }), "rampa");
    const names = screen.getAllByRole("option").map((o) => o.getAttribute("data-rule-id"));
    expect(names).toEqual(["A110-AIV-RAMPA-DOBLE", "DEMO-ACC-RAMPA-PENDIENTE"]);
    expect(screen.getByRole("heading", { name: /^Estacionamientos/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Accesibilidad/ })).toBeInTheDocument();
  });

  it("al elegir una regla actualiza el detalle, la URL y el resaltado", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("option", { name: /A110-AIV-RAMPA-DOBLE/ }));
    expect(document.getElementById("rule-details-title")).toHaveTextContent("Rampa vehicular de doble sentido");
    expect(screen.getByText("≥ 6 m")).toBeInTheDocument();
    expect(screen.getByText("por debajo del mínimo")).toBeInTheDocument();
    expect(within(planSvg()).getByText(/5\.50 m · requerido 6\.00 m/)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith(expect.stringContaining("rule=A110-AIV-RAMPA-DOBLE"), { scroll: false }));
  });

  it("mueve la selección con las flechas", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const first = await screen.findByRole("option", { name: /PLOT-RM-2-LOTE-AREA/ });
    await user.click(first);
    await user.keyboard("{ArrowDown}");
    const next = screen.getByRole("option", { name: /PLOT-RM-2-LOTE-FRENTE/ });
    expect(next).toHaveAttribute("aria-selected", "true");
    expect(next).toHaveFocus();
  });

  it("abre la regla del enlace profundo y avisa si no tiene geometría", async () => {
    resetWorkspace("rule=DEMO-EST-VISITAS");
    renderWorkspace();
    await waitFor(() => expect(document.getElementById("rule-details-title")).toHaveTextContent(/visitas/i));
    expect(screen.getByRole("status")).toHaveTextContent("Esta regla no tiene geometría asociada en el plano");
    expect(within(planSvg()).queryByText(/4\.25 m/)).not.toBeInTheDocument();
  });

  it("indica que las reglas de demostración no tienen cita literal", async () => {
    resetWorkspace("rule=DEMO-EST-CANTIDAD");
    renderWorkspace();
    await waitFor(() => expect(document.getElementById("rule-details-title")).toBeInTheDocument());
    expect(screen.getAllByText(/Regla de demostración: no está en el catálogo/)[0]).toBeInTheDocument();
    expect(within(planSvg()).getByText("Sótano: 22 espacios")).toBeInTheDocument();
  });
});

