import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";

const servidor = vi.hoisted(() => ({
  subirPlano: vi.fn(),
  estadoDelPlano: vi.fn(),
  ejemplosDePlanos: vi.fn(),
  usarEjemplo: vi.fn(),
  miniaturaUrl: (id: string, n: number) => `/api/planos/${id}/paginas/${n}`,
}));
vi.mock("@/services/planos/cliente", () => servidor);

import { ProjectPlans } from "./project-plans";

const EXTRACCION = {
  formato: "1.0.0",
  documento: "Bella Vista - RLA-0000-6.pdf",
  sha256: "x",
  escalas: [],
  paginas: [{ numero: 1, tipo: "vectorial", ancho_mm: 1067, alto_mm: 762, lineas: 376, miniatura: "p1.png", lamina: { codigo: "AR-01", titulo: "LOTE", escala: null, hoja: null, total_hojas: null } }],
  hechos: [{ hecho: "lote.corregimiento", valor: "Bella Vista", confianza: 0.89, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } }],
  requisitos_anexo_iv: [],
};
const TIMEOUT = { timeout: 4000 };

describe("ProjectPlans: lectura de planos PDF", () => {
  beforeEach(() => {
    Object.values(servidor).forEach((f) => "mockReset" in f && f.mockReset());
    servidor.ejemplosDePlanos.mockResolvedValue([{ nombre: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 1_200_000 }, { nombre: "Ancón - RLA-0000-11.pdf", sizeBytes: 900_000 }]);
  });

  // Primero: el store simulado es del módulo y el caso siguiente le agrega un plano leído.
  it("los planos sin lectura (DWG, IFC y el PDF de demostración) no muestran sección de lectura", async () => {
    renderWithProviders(<ProjectPlans projectId="prj-betania-01" />);
    await screen.findByRole("table", {}, TIMEOUT);
    expect(screen.queryByRole("region", { name: /^Lectura de/ })).not.toBeInTheDocument();
  });

  it("carga un anteproyecto de ejemplo, lo lee y contrasta con el expediente", async () => {
    servidor.usarEjemplo.mockResolvedValue({ id: "plan-srv-bv", status: "queued", fileName: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 1_200_000 });
    servidor.estadoDelPlano.mockResolvedValue({ id: "plan-srv-bv", status: "ready", fileName: "Bella Vista - RLA-0000-6.pdf", extraccion: EXTRACCION });
    const user = userEvent.setup();
    renderWithProviders(<ProjectPlans projectId="prj-betania-01" />);

    const selector = await screen.findByRole("combobox", { name: "Plano de ejemplo" }, TIMEOUT);
    await screen.findByRole("option", { name: /Ancón - RLA-0000-11\.pdf/ }, TIMEOUT);
    await user.selectOptions(selector, "Bella Vista - RLA-0000-6.pdf");
    await user.click(screen.getByRole("button", { name: "Cargar y leer el ejemplo" }));
    expect(servidor.usarEjemplo).toHaveBeenCalledWith("Bella Vista - RLA-0000-6.pdf", undefined);

    const lectura = await screen.findByRole("region", { name: "Lectura de Bella Vista - RLA-0000-6.pdf" }, TIMEOUT);
    const contraste = await within(lectura).findByRole("list", { name: "Contraste con el expediente" }, TIMEOUT);
    expect(within(contraste).getByText("Corregimiento: el plano dice Bella Vista; el expediente, Betania")).toBeInTheDocument();
    const fila = within(screen.getByRole("table")).getByText("Bella Vista - RLA-0000-6.pdf").closest("tr") as HTMLElement;
    expect(within(fila).getAllByRole("cell").map((c) => c.textContent)).toEqual(expect.arrayContaining(["1", "Listo"]));
  });
});
