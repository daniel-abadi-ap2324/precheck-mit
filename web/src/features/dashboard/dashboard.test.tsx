import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { useSessionStore } from "@/stores/session";
import { DashboardPage } from "./components/dashboard-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/map", () => ({ MapViewer: () => null }));

describe("DashboardPage", { timeout: 15_000 }, () => {
  beforeEach(() => {
    useSessionStore.setState({
      session: { token: "t", user: { id: "P-0002", name: "Arq. Ejemplo Uno", role: "revisor_doyc", email: "lucia@example.test" } },
    });
  });

  it("saluda al usuario y resume lo pendiente", async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole("heading", { level: 1, name: /Arq\. Ejemplo Uno/ })).toBeInTheDocument();
    expect(await screen.findByText(/1 proyecto requiere revisión/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nuevo PreCheck/ })).toHaveAttribute("href", "/projects/new");
  });

  it("muestra los indicadores calculados", async () => {
    renderWithProviders(<DashboardPage />);
    const kpis = await screen.findByRole("region", { name: "Indicadores del período" });
    expect(within(kpis).getByText("Proyectos totales")).toBeInTheDocument();
    expect(within(kpis).getByText("6")).toBeInTheDocument();
    expect(within(kpis).getByText("Revisiones cerradas")).toBeInTheDocument();
    expect(within(kpis).getByText("Pendientes de revisión DOYC")).toBeInTheDocument();
    // Cerrar una revisión no es cumplir: el indicador no usa el verde de «Cumple».
    expect(within(kpis).getByText("Revisiones cerradas").closest("[data-tone]")?.getAttribute("data-tone")).not.toBe("pass");
    // (73 + 91 + 86) / 3 = 83,3 → 83 %
    expect(within(kpis).getByText("83 %")).toBeInTheDocument();
    expect(within(kpis).getByText(/índice preliminar, no es aprobación/)).toBeInTheDocument();
    // 7 incumplimientos del PreCheck de demostración, una vez que llega.
    expect(await within(kpis).findByText("7")).toBeInTheDocument();
    expect(within(kpis).getByText(/en 1 PreCheck del período/)).toBeInTheDocument();
  });

  it("lista los proyectos recientes con sus estados y nunca dice «Aprobado»", async () => {
    renderWithProviders(<DashboardPage />);
    const table = await screen.findByRole("table", { name: "Proyectos recientes" });
    for (const label of ["Borrador", "Procesando", "Pendiente de revisión DOYC", "Revisión cerrada", "Error al procesar"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(table).getByRole("link", { name: "Residencia Betania 01" })).toHaveAttribute("href", "/projects/prj-betania-01");
    expect(screen.queryByText(/aprobad[oa]/i)).not.toBeInTheDocument();
  });

  it("la tabla del panel muestra el índice preliminar y oculta columnas secundarias", async () => {
    renderWithProviders(<DashboardPage />);
    const table = await screen.findByRole("table", { name: "Proyectos recientes" });
    const cabeceras = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(cabeceras).toContain("Índice preliminar");
    expect(cabeceras).not.toContain("Dirección");
    expect(cabeceras).not.toContain("Última actualización");
  });

  it("enlaza la cola de revisión al workspace", async () => {
    renderWithProviders(<DashboardPage />);
    const queue = await screen.findByRole("region", { name: "Pendientes de revisión" });
    expect(within(queue).getByRole("link", { name: /Residencia Betania 01/ })).toHaveAttribute("href", "/projects/prj-betania-01/precheck");
  });
});
