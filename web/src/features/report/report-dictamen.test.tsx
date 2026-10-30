import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { traducirExpediente } from "@/server/expedientes/traductor";
import { DICTAMEN_SINTETICO, RESULTADO_CON_ZONA } from "@/test/expediente-sintetico";
import { renderWithProviders } from "@/test/render";
import { unirResultados } from "@/hooks/use-rule-results";
import { ReportPage } from "./components/report-page";
import { ReportsList } from "./components/reports-list";
import { renderReportHtml } from "./lib/report-html";
import { buildReportModel } from "./lib/report-model";

vi.mock("next/navigation", async () => (await import("../results/test/navigation-mock")).navigationModule);

const TIMEOUT = { timeout: 4000 };
const ID = "exp-pueblo-ficticio-rla-0000-1";
const expediente = traducirExpediente({
  slug: "pueblo-ficticio-rla-0000-1",
  carpeta: "Pueblo Ficticio  -  RLA-0000-1",
  resultado: RESULTADO_CON_ZONA,
  dictamen: DICTAMEN_SINTETICO,
  fecha: "2026-01-16T10:00:00.000Z",
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/expedientes/")) return Response.json(expediente);
      if (url.startsWith("/api/expedientes")) return Response.json({ items: [expediente.project] });
      return new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Informe de un expediente con dictamen del arquitecto revisor", () => {
  it("/reports cuenta los estados del dictamen, con las observaciones aparte", async () => {
    renderWithProviders(<ReportsList />);
    const fila = (await screen.findByText("Pueblo Ficticio · RLA-0000-1", undefined, TIMEOUT)).closest("tr") as HTMLElement;
    expect(fila).toHaveTextContent("Según el dictamen del arquitecto revisor");
    expect(fila).toHaveTextContent("2 no cumplen · 2 observaciones · 0 a revisar · 1 cumple");
    expect(fila).not.toHaveTextContent("agrupadas por zona");
    expect(within(fila).getByText("Pendiente de revisión DOYC")).toBeInTheDocument();
  });

  it("el informe muestra arriba la conclusión y los supuestos, los estados del dictamen y «Qué subsanar»", async () => {
    renderWithProviders(<ReportPage projectId={ID} />);
    await screen.findByRole("navigation", { name: "Navegación del informe" }, TIMEOUT);
    const secciones = [...document.querySelectorAll("article section[id]")].map((s) => s.id);
    // «Qué se supuso en esta revisión» (ADR-0016: lleva los avisos del motor) va primero, y la conclusión después.
    expect(secciones.slice(0, 3)).toEqual(["encabezado", "que-se-supuso", "dictamen"]);

    const dictamen = document.getElementById("dictamen") as HTMLElement;
    expect(within(dictamen).getByTestId("conclusion-dictamen")).toHaveTextContent("El anteproyecto no puede seguir tal como está");
    expect(within(dictamen).getByText("Zona R3 asumida: declarada en el plano; sin CEUS")).toBeInTheDocument();

    const header = document.getElementById("encabezado") as HTMLElement;
    expect(header).toHaveTextContent("Fuente del resultado");
    expect(header).toHaveTextContent("Dictamen del arquitecto revisor (agente revisor-planos)");
    expect(within(header).getByRole("note")).toHaveTextContent(/preliminares/);

    const noCumplen = document.getElementById("no-cumplen") as HTMLElement;
    expect(within(noCumplen).getByText("Topografía con curvas de nivel")).toBeInTheDocument();
    expect(within(noCumplen).getByTestId("que-subsanar")).toHaveTextContent("Agregar la topografía con curvas de nivel a 1.00 m o menos.");
    expect(within(document.getElementById("observaciones") as HTMLElement).getByText("AC-R3-USOS", { selector: "span" })).toBeInTheDocument();
    // Nada quedó en revisión y las reglas de otras zonas (NO_APLICA) no se listan ni van en la línea agrupada.
    expect(document.getElementById("requieren-revision")).toHaveTextContent("Ninguna regla requiere revisión.");
    expect(screen.queryByTestId("fila-zona-por-confirmar")).not.toBeInTheDocument();
    expect(screen.queryByText("R1: altura")).not.toBeInTheDocument();

    const resumen = document.getElementById("resumen") as HTMLElement;
    expect(resumen).toHaveTextContent("Se evaluaron 5 reglas");
    expect(resumen).toHaveTextContent("20 %");
  });

  it("el HTML descargable refleja lo mismo: conclusión, supuestos, fuente, qué subsanar y la nota preliminar", () => {
    const items = unirResultados(expediente.precheck.results, [], expediente.precheck.rules);
    const model = buildReportModel({ version: "revisor", project: expediente.project, property: null, plans: [], precheck: expediente.precheck, items, generatedAt: "2026-01-16T10:00:00.000Z" });
    const html = renderReportHtml(model);
    expect(html.indexOf('id="dictamen"')).toBeLessThan(html.indexOf('id="proyecto"'));
    expect(html).toContain("Conclusión del arquitecto revisor");
    expect(html).toContain("Zona R3 asumida: declarada en el plano; sin CEUS");
    expect(html).toContain("Dictamen del arquitecto revisor (agente revisor-planos)");
    expect(html).toContain("<b>Qué subsanar:</b> Agregar la topografía con curvas de nivel a 1.00 m o menos.");
    expect(html).toContain("Motor: Requiere revisión");
    expect(html).toContain("5 reglas evaluadas: 1 cumple, 2 no cumple, 2 observación, 0 requieren revisión");
    expect(html).toContain("Acuerdo 110, Art. 3");
    expect(html).not.toContain("dependen de confirmar el código de zona");
  });

  it("el HTML lleva el modelo, el costo, las discrepancias de regiones, las reservas y las marcas como texto", () => {
    const conExtras = traducirExpediente({
      slug: "pueblo-ficticio-rla-0000-1",
      carpeta: "Pueblo Ficticio  -  RLA-0000-1",
      resultado: RESULTADO_CON_ZONA,
      dictamen: {
        ...DICTAMEN_SINTETICO,
        modelo: "claude-sonnet-5-5",
        costo_usd: 1.5,
        regiones_discrepantes: [{ dato: "proyecto.estacionamientos", detalle: "declara 373 y se dibujan 369" }],
        decisiones: [
          ...DICTAMEN_SINTETICO.decisiones.map((d) => (d.regla_id === "A110-AIV-CURVAS-NIVEL" ? { ...d, evidencia: [{ pagina: 1, detalle: "localización", marcas: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1, etiqueta: "Falta: curvas" }] }] } : d)),
          { regla_id: "AC-R3-RETIRO-FRONTAL", decision: "CUMPLE", justificacion: "A mi juicio alcanza.", evidencia: [] },
        ],
      },
      fecha: "2026-01-16T10:00:00.000Z",
    });
    const items = unirResultados(conExtras.precheck.results, [], conExtras.precheck.rules);
    const model = buildReportModel({ version: "revisor", project: conExtras.project, property: null, plans: [], precheck: conExtras.precheck, items, generatedAt: "2026-01-16T10:00:00.000Z" });
    const html = renderReportHtml(model);
    expect(html).toContain("<dt>Modelo de IA</dt><dd>claude-sonnet-5-5</dd>");
    expect(html).toContain("<dt>Costo de la revisión con IA</dt><dd>1.50 USD</dd>");
    expect(html).toContain("Regiones del plano que no coinciden con lo declarado");
    expect(html).toContain("proyecto.estacionamientos: declara 373 y se dibujan 369");
    expect(html).toContain("1 decisión no se aplicó porque el motor ya había decidido esa regla");
    expect(html).toContain("<b>Prevalece el motor de reglas.</b> La IA propuso CUMPLE, pero el motor ya había decidido NO_CUMPLE");
    expect(html).toContain("<b>Marcas en el plano:</b> p. 1: Falta: curvas (x 0.10, y 0.20, 0.30 × 0.10)");
  });
});
