import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { currentSearch, resetNavigation } from "./test/navigation-mock";
import { ResultsPage } from "./components/results-page";

vi.mock("next/navigation", async () => (await import("./test/navigation-mock")).navigationModule);

const TIMEOUT = { timeout: 4000 };

function desktopViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

async function renderResults() {
  const user = userEvent.setup();
  renderWithProviders(<ResultsPage projectId="prj-betania-01" />);
  await screen.findByTestId("summary-ALL", {}, TIMEOUT);
  return user;
}

const rows = () => screen.getAllByTestId("result-row");

describe("Compliance Results", () => {
  beforeEach(() => {
    resetNavigation();
    desktopViewport();
  });

  it("muestra 52 evaluadas, 38 cumple, 7 no cumple, 4 observación y 3 requiere revisión, con la nota preliminar y sin «Aprobado»", async () => {
    await renderResults();
    expect(within(screen.getByTestId("summary-ALL")).getByText("52")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-PASS")).getByText("38")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-FAIL")).getByText("7")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-WARNING")).getByText("4")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-MANUAL_REVIEW")).getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/resultados del PreCheck son preliminares/i);
    expect(screen.getByText("Índice preliminar de cumplimiento")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /73 %.*38 cumple, 4 observación, 3 requiere revisión, 7 no cumple/ })).toBeInTheDocument();
    expect(screen.queryByText(/aprobado/i)).not.toBeInTheDocument();
  });

  it("filtra a «No cumple» (7 filas, ?status=FAIL) y la búsqueda «retiro» acota el resultado", async () => {
    const user = await renderResults();
    expect(rows()).toHaveLength(10);
    await user.click(within(screen.getByRole("group", { name: "Filtrar por estado" })).getByRole("button", { name: /^No cumple/ }));
    await waitFor(() => expect(rows()).toHaveLength(7));
    expect(currentSearch()).toContain("status=FAIL");

    await user.type(screen.getByRole("searchbox", { name: "Buscar regla" }), "retiro");
    await waitFor(() => expect(rows()).toHaveLength(2), TIMEOUT);
    expect(currentSearch()).toContain("q=retiro");
    expect(screen.getByText("PLOT-RM-2-RETIROS")).toBeInTheDocument();
    expect(screen.getByText("DEMO-RET-LATERAL")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando ningún resultado coincide", async () => {
    const user = await renderResults();
    await user.type(screen.getByRole("searchbox", { name: "Buscar regla" }), "zzz-inexistente");
    expect(await screen.findByText("Ninguna regla coincide con los filtros", {}, TIMEOUT)).toBeInTheDocument();
  });

  it("ordena por Diferencia con aria-sort", async () => {
    const user = await renderResults();
    const header = screen.getByRole("columnheader", { name: /Diferencia/ });
    expect(header).toHaveAttribute("aria-sort", "none");

    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(rows()[0]).getByText("PLOT-RM-2-DENSIDAD")).toBeInTheDocument();

    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    // La mayor diferencia positiva: área del lote 960 m² frente a un mínimo de 800 m² (+160 m²).
    expect(within(rows()[0]).getByText("PLOT-RM-2-LOTE-AREA")).toBeInTheDocument();
  });

  it("pagina de 10 en 10", async () => {
    const user = await renderResults();
    expect(screen.getByText("Página 1 de 6")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(screen.getByText("Página 2 de 6")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filas por página"), "50");
    expect(rows()).toHaveLength(50);
  });
});
