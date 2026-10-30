import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { traducirExpediente } from "@/server/expedientes/traductor";
import { EXTRACCION_SINTETICA, HECHOS_SINTETICOS, RESULTADO_CON_ZONA } from "@/test/expediente-sintetico";
import { renderWithProviders } from "@/test/render";
import { nav, resetWorkspace } from "./setup-workspace";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/projects/exp-pueblo-ficticio-rla-0000-1/precheck",
}));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <hr />,
}));

const { PreCheckWorkspace } = await import("../components/precheck-workspace");

const ID = "exp-pueblo-ficticio-rla-0000-1";
const traducido = traducirExpediente({
  slug: "pueblo-ficticio-rla-0000-1",
  carpeta: "Pueblo Ficticio  -  RLA-0000-1",
  resultado: RESULTADO_CON_ZONA,
  hechos: HECHOS_SINTETICOS,
  extraccion: EXTRACCION_SINTETICA,
  fecha: "2026-01-16T15:00:00.000Z",
});
const expediente = {
  ...traducido,
  project: { ...traducido.project, expediente: { ...traducido.project.expediente!, miniaturas: [1, 2, 3], documentoDisponible: true } },
};

beforeEach(() => {
  resetWorkspace();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url.startsWith("/api/expedientes/") ? Response.json(expediente) : new Response("{}", { status: 404 }))),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Revisión de un expediente real", { timeout: 15_000 }, () => {
  it("muestra el documento del expediente (no el plano de demostración) en la página que cita la regla", async () => {
    renderWithProviders(<PreCheckWorkspace projectId={ID} />);
    await waitFor(() => expect(document.getElementById("rule-details-title")).toHaveTextContent("R3: retiro frontal"));
    const visor = screen.getByRole("region", { name: "Documento del expediente" });
    expect(within(visor).getByRole("img", { name: "Página 2" })).toHaveAttribute("src", `/api/expedientes/${ID}/paginas/2`);
    expect(within(visor).getByRole("link", { name: /Abrir el PDF original/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Lámina A-101/ })).not.toBeInTheDocument();

    await userEvent.setup().click(within(visor).getByRole("button", { name: "Página anterior" }));
    expect(within(visor).getByRole("img", { name: "Página 1 · lámina A-101" })).toBeInTheDocument();
  });

  it("la revisión es de solo lectura: sin revisores de prueba ni comentarios", async () => {
    renderWithProviders(<PreCheckWorkspace projectId={ID} />);
    await waitFor(() => expect(document.getElementById("rule-details-title")).toBeInTheDocument());
    expect(screen.getByText(/Expediente de solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Asignar revisor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Comentar/ })).not.toBeInTheDocument();
  });

  it("las reglas agrupadas por zona van en una sola línea y cuentan en «Requiere revisión»", async () => {
    renderWithProviders(<PreCheckWorkspace projectId={ID} />);
    const linea = await screen.findByTestId("linea-zona-por-confirmar");
    expect(linea).toHaveTextContent("2 reglas de otras zonas de la norma");
    expect(screen.queryByRole("option", { name: /R1: altura/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Requiere revisión\s*4/ })).toBeInTheDocument();
    expect(screen.getByText(`${expediente.precheck.results.length} reglas evaluadas`)).toBeInTheDocument();
  });
});
