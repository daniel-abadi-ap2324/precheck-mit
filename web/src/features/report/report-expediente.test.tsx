import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { traducirExpediente } from "@/server/expedientes/traductor";
import { RESULTADO_SINTETICO } from "@/test/expediente-sintetico";
import { renderWithProviders } from "@/test/render";
import { ReportPage } from "./components/report-page";
import { ReportsList } from "./components/reports-list";
import { renderReportHtml } from "./lib/report-html";
import { buildReportModel } from "./lib/report-model";
import { unirResultados } from "@/hooks/use-rule-results";

vi.mock("next/navigation", async () => (await import("../results/test/navigation-mock")).navigationModule);

const TIMEOUT = { timeout: 4000 };
const INFORME = "# Conclusión\n\nEl lote **requiere revisión**.\n\n- Falta la CEUS\n- <img src=x onerror=alert(1)>\n\n| Regla | Estado |\n|---|---|\n| R3 | revisión |";
const expediente = traducirExpediente({
  slug: "pueblo-ficticio-rla-0000-1",
  carpeta: "Pueblo Ficticio  -  RLA-0000-1",
  resultado: RESULTADO_SINTETICO,
  informe: INFORME,
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

describe("Informe de un expediente real", () => {
  it("/reports lista el expediente junto a la demostración, con la marca de expediente real", async () => {
    renderWithProviders(<ReportsList />);
    const fila = (await screen.findByText("Pueblo Ficticio · RLA-0000-1", undefined, TIMEOUT)).closest("tr") as HTMLElement;
    expect(within(fila).getByText("Expediente real · resultado preliminar")).toBeInTheDocument();
    expect(within(fila).getByRole("link", { name: /Abrir informe/ })).toHaveAttribute("href", "/projects/exp-pueblo-ficticio-rla-0000-1/report");
  });

  it("el informe muestra los resultados reales (aunque las reglas no estén en el catálogo), la marca y el informe del revisor", async () => {
    renderWithProviders(<ReportPage projectId="exp-pueblo-ficticio-rla-0000-1" />);
    await screen.findByRole("navigation", { name: "Navegación del informe" }, TIMEOUT);
    const header = document.getElementById("encabezado") as HTMLElement;
    expect(within(header).getByText("Expediente real · resultado preliminar")).toBeInTheDocument();
    expect(within(header).getByRole("note")).toHaveTextContent(/preliminares/);
    expect(within(document.getElementById("no-cumplen") as HTMLElement).getByText("R3: retiro frontal")).toBeInTheDocument();
    expect(within(document.getElementById("requieren-revision") as HTMLElement).getByText("Topografía con curvas de nivel")).toBeInTheDocument();

    const narrativa = document.getElementById("informe-revisor") as HTMLElement;
    expect(within(narrativa).getByRole("heading", { name: "Informe del revisor automático" })).toBeInTheDocument();
    expect(within(narrativa).getByText("requiere revisión").tagName).toBe("STRONG");
    // El HTML del Markdown se muestra como texto, nunca como elemento.
    expect(within(narrativa).getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(narrativa.querySelector("img")).toBeNull();
  });

  it("el HTML descargable lleva el informe del revisor escapado", () => {
    const items = unirResultados(expediente.precheck.results, [], expediente.precheck.rules);
    const model = buildReportModel({ version: "revisor", project: expediente.project, property: null, plans: [], precheck: expediente.precheck, items, generatedAt: "2026-01-16T10:00:00.000Z" });
    const html = renderReportHtml(model);
    expect(html).toContain("Informe del revisor automático");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("Trámite");
  });
});
