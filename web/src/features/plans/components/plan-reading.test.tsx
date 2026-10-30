import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import type { Plan, PlanExtraction } from "@/types";
import { PlanReading } from "./plan-reading";

const EXTRACCION: PlanExtraction = {
  formato: "1.0.0",
  documento: "Bella Vista - RLA-0000-6.pdf",
  sha256: "x",
  escalas: [20, 100],
  paginas: [
    { numero: 1, tipo: "vectorial", ancho_mm: 1067, alto_mm: 762, lineas: 376, miniatura: "p1.png", lamina: { codigo: "AR-01", titulo: "LOTE", escala: null, hoja: null, total_hojas: null } },
    { numero: 2, tipo: "escaneada", ancho_mm: 1067, alto_mm: 762, lineas: 120, miniatura: "p2.png", lamina: { codigo: null, titulo: null, escala: 100, hoja: 2, total_hojas: 9 } },
  ],
  hechos: [
    { hecho: "lote.area_m2", valor: 727.54, confianza: 0.99, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } },
    { hecho: "lote.finca", valor: null, confianza: 0.4, estado: "revision", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] }, candidatos: ["071091", "071122"] },
    { hecho: "lote.corregimiento", valor: "Bella Vista", confianza: 0.89, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } },
  ],
  requisitos_anexo_iv: [
    { requisito: "localizacion_regional", existe: true, confianza: 0.9, fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } },
    { requisito: "cuadro_de_areas", existe: false, confianza: 0.5, fuente: null },
  ],
};
const plan = (p: Partial<Plan>): Plan => ({ id: "plan-1", projectId: "prj-1", fileName: "Bella Vista - RLA-0000-6.pdf", format: "PDF", sizeBytes: 1, status: "ready", progress: 100, sheets: [], extraction: EXTRACCION, ...p });

describe("PlanReading", () => {
  it("mientras se lee lo dice, sin datos a medias", () => {
    renderWithProviders(<PlanReading plan={plan({ status: "processing", extraction: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Leyendo el plano…");
  });

  it("en revisión, la nota del lector explica el motivo en lugar del texto genérico", () => {
    const ext = { ...EXTRACCION, hechos: [{ hecho: "lote.frente_m", valor: null, confianza: 0.6, estado: "revision" as const, fuente: null, candidatos: [26.02], nota: "La dirección nombra dos calles." }] };
    renderWithProviders(<PlanReading plan={plan({ extraction: ext })} />);
    const datos = screen.getByRole("list", { name: "Datos leídos del plano" });
    expect(within(datos).getByRole("note")).toHaveTextContent("Requiere revisión. La dirección nombra dos calles.");
  });

  it("si la lectura falla, dice por qué", () => {
    renderWithProviders(<PlanReading plan={plan({ status: "failed", extraction: null, error: "No se pudo leer el plano." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo leer el plano.");
  });

  it("listo: hojas con miniatura y código, datos leídos con su procedencia y requisitos del Anexo IV", () => {
    renderWithProviders(<PlanReading plan={plan({})} contexto={{ corregimiento: "Betania", areaM2: 727.54 }} />);
    expect(screen.getByText("2 láminas · 1 con texto del PDF · 1 escaneada (OCR)")).toBeInTheDocument();
    const laminas = screen.getByRole("list", { name: "Láminas del plano" });
    expect(within(laminas).getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual(["/api/planos/plan-1/paginas/1", "/api/planos/plan-1/paginas/2"]);
    expect(within(laminas).getByText("AR-01")).toBeInTheDocument();
    expect(within(laminas).getByText("Lámina 2 de 9 · Esc. 1:100 · escaneada (OCR)")).toBeInTheDocument();

    const datos = screen.getByRole("list", { name: "Datos leídos del plano" });
    expect(within(datos).getByText("727.54 m²")).toBeInTheDocument();
    expect(within(datos).getByText("Texto del PDF · página 1 · confianza 99 %")).toBeInTheDocument();
    expect(within(datos).getByText("Varias: 071091, 071122")).toBeInTheDocument();
    expect(within(datos).getAllByText(/Requiere revisión/).length).toBeGreaterThan(0);

    const contraste = screen.getByRole("list", { name: "Contraste con el expediente" });
    expect(within(contraste).getByText(/Corregimiento: el plano dice Bella Vista; el expediente, Betania/)).toBeInTheDocument();
    expect(within(contraste).getByText(/Área del lote: coincide/)).toBeInTheDocument();

    const anexo = screen.getByRole("list", { name: "Requisitos del Anexo IV" });
    expect(within(anexo).getByText("Localización regional")).toBeInTheDocument();
    expect(within(anexo).getByText("Encontrado · página 1")).toBeInTheDocument();
    expect(within(anexo).getByText("No encontrado · requiere revisión")).toBeInTheDocument();
  });
});

describe("PlanReading: datos informativos", () => {
  it("un dato «informativo» (norma transcrita en el plano) se muestra sin romper la lectura", () => {
    const informativo = { hecho: "plano.norma_transcrita.altura_max", valor: "PB + 9 altos", confianza: 0.5, estado: "informativo" as const, fuente: { metodo: "pdf_texto" as const, pagina: 1, bbox: [0, 0, 1, 1] as [number, number, number, number] } };
    renderWithProviders(<PlanReading plan={plan({ extraction: { ...EXTRACCION, hechos: [...EXTRACCION.hechos, informativo] } })} />);
    expect(screen.getByText("PB + 9 altos")).toBeInTheDocument();
  });
});

describe("PlanReading: confirmar lo leído (paso 1)", () => {
  const conRevision: PlanExtraction = {
    ...EXTRACCION,
    hechos: [
      ...EXTRACCION.hechos,
      { hecho: "lote.frente_m", valor: 26.02, confianza: 1, estado: "ok", fuente: { metodo: "humano", pagina: 0, bbox: [0, 0, 0, 0] }, corregido: true, valorOriginal: 25 },
      { hecho: "plano.zonificacion_declarada", valor: "RM1", confianza: 1, estado: "ok", fuente: { metodo: "humano", pagina: 1, bbox: [0, 0, 1, 1] }, confirmado: true },
    ],
  };

  it("cada dato muestra su estado (comprobado, confirmado o corregido) y lo que falta para ejecutar", () => {
    renderWithProviders(<PlanReading plan={plan({ extraction: conRevision })} onCorregir={vi.fn()} />);
    const datos = screen.getByRole("list", { name: "Datos leídos del plano" });
    const fila = (texto: string) => within(datos).getByText(texto).closest("li") as HTMLElement;
    // Leído del texto del PDF con 0.99: queda comprobado sin preguntar.
    expect(within(fila("Área del lote")).getByText("Comprobado en el plano")).toBeInTheDocument();
    expect(within(fila("Frente del lote")).getByText("Corregido")).toBeInTheDocument();
    expect(within(fila("Zonificación declarada")).getByText("Confirmado")).toBeInTheDocument();
    expect(within(fila("Zonificación declarada")).getByText("Confirmado por el usuario · leído en la página 1")).toBeInTheDocument();
    // La finca está en duda (dos candidatas): no se ofrece confirmarla, hay que corregirla.
    expect(within(fila("Finca")).queryByRole("button", { name: "Confirmar Finca" })).toBeNull();
    expect(within(fila("Área del lote")).queryByRole("button", { name: "Confirmar Área del lote" })).toBeNull();
    expect(screen.getByText(/No se pudo comprobar en el plano la finca\./)).toBeInTheDocument();
  });

  it("«Confirmar todos» confirma de una vez solo lo leído con un valor y sin revisar", async () => {
    const user = userEvent.setup();
    const onCorregir = vi.fn().mockResolvedValue(undefined);
    // Leídos por OCR con poca confianza: hay que confirmarlos.
    const dudosos = { ...conRevision, hechos: conRevision.hechos.map((h) => (h.hecho === "lote.area_m2" || h.hecho === "lote.corregimiento" ? { ...h, confianza: 0.7 } : h)) };
    renderWithProviders(<PlanReading plan={plan({ extraction: dudosos })} onCorregir={onCorregir} />);
    await user.click(screen.getByRole("button", { name: "Confirmar todos (2)" }));
    expect(onCorregir).toHaveBeenCalledWith({ "lote.area_m2": { confirmar: true }, "lote.corregimiento": { confirmar: true } });
  });

  it("sin edición (solo lectura) no hay botones ni estados pendientes", () => {
    renderWithProviders(<PlanReading plan={plan({ extraction: conRevision })} />);
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
    expect(screen.queryByText("Pendiente de confirmar")).toBeNull();
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
  });
});
