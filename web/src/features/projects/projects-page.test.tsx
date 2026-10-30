import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { ProjectsPage } from "./components/projects-page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/projects",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/map", () => ({ MapViewer: () => null }));

const rowNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("link")[0].textContent);

describe("ProjectsPage", { timeout: 15_000 }, () => {
  beforeEach(() => replace.mockClear());

  it("filtra por estado «Revisión cerrada» y lo refleja en la URL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectsPage initialFilters={{ q: "", status: null, view: "table" }} />);
    const table = await screen.findByRole("table", { name: "Proyectos" });
    expect(rowNames(table)).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: /Revisión cerrada/ }));
    await waitFor(() => expect(rowNames(screen.getByRole("table", { name: "Proyectos" }))).toEqual(["Edificio Betania 13", "Condominio Betania 32"]));
    expect(screen.getByRole("button", { name: /Revisión cerrada/ })).toHaveAttribute("aria-pressed", "true");
    expect(replace).toHaveBeenCalledWith("/projects?status=COMPLETED", { scroll: false });
    expect(screen.queryByText(/aprobad[oa]/i)).not.toBeInTheDocument();
  });

  it("la búsqueda acota la lista", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectsPage initialFilters={{ q: "", status: null, view: "table" }} />);
    await screen.findByRole("table", { name: "Proyectos" });

    await user.type(screen.getByRole("searchbox", { name: /Buscar proyectos/ }), "Torre");
    await waitFor(() => expect(rowNames(screen.getByRole("table", { name: "Proyectos" }))).toEqual(["Torre Betania 08"]), { timeout: 2000 });
    expect(replace).toHaveBeenLastCalledWith("/projects?q=Torre", { scroll: false });
  });

  it("muestra un estado vacío con acción cuando nada coincide", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProjectsPage initialFilters={{ q: "zzzz-sin-resultados", status: null, view: "cards" }} />);
    expect(await screen.findByText("Ningún proyecto coincide", undefined, { timeout: 2000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(await screen.findAllByRole("link", { name: "Residencia Betania 01" }, { timeout: 2000 })).not.toHaveLength(0);
  });
});
