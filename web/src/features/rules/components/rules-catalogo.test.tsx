import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { leerNormas, traducirRegla } from "@/server/reglas/traductor";
import { olvidarCatalogo } from "@/services/reglas/cliente";
import { RulesView } from "./rules-view";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const normas = leerNormas({
  "A110-2025": { nombre: "Acuerdo N°110", prefijos: ["A110-"] },
  "MIVIOT-EC-R192-2013": { nombre: "El Carmen, Res. 192-2013", prefijos: ["EC-"] },
  "MIVIOT-AC-R160-2002": { nombre: "Área del Canal", prefijos: ["AC-"] },
});
/** Catálogo sintético: 3 de A110, 20 de El Carmen y 7 del Área del Canal. */
const catalogo = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `A110-R-${i}`, titulo: `A110 regla ${i}` })),
  ...Array.from({ length: 20 }, (_, i) => ({ id: `EC-R1A-${i}`, titulo: `R1-A regla ${i}`, aplica_si: "lote.codigo_zona in ['R1-A']", condicion: i === 0 ? "lote.frente_m >= 15 and lote.frente_m <= 25" : undefined })),
  ...Array.from({ length: 7 }, (_, i) => ({ id: `AC-R3-${i}`, titulo: `R3 regla ${i}`, aplica_si: "lote.codigo_zona in ['R3']" })),
].map((r, i) => traducirRegla({ ...r, estado_revision: "borrador" }, normas, "x.json", i));

beforeEach(() => {
  olvidarCatalogo();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url === "/api/reglas" ? Response.json({ items: catalogo }) : new Response("{}", { status: 404 }))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  olvidarCatalogo();
});

describe("RulesView con el catálogo real", { timeout: 15_000 }, () => {
  it("muestra el total del catálogo y filtra por norma con el conteo de cada una", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RulesView />);
    expect(await screen.findByRole("status")).toHaveTextContent("30 reglas en el catálogo");
    const norma = screen.getByRole("combobox", { name: "Norma" });
    expect(within(norma).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todas (30)", "Acuerdo 110 (3)", "Área del Canal (Res. 160-2002) (7)", "El Carmen (20)"]);

    await user.selectOptions(norma, "MIVIOT-EC-R192-2013");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("30 reglas en el catálogo · 20 con los filtros"));
    expect(screen.getByText(/20 reglas · página 1 de 2/)).toBeInTheDocument();
    // Las zonas del filtro son las de la norma elegida.
    expect(within(screen.getByRole("combobox", { name: "Zonificación" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todas", "General (sin zona)", "R1-A"]);
    // Una condición compuesta no se reduce a un operador.
    expect(screen.getAllByText("Condición").length).toBeGreaterThan(0);
  });
});
