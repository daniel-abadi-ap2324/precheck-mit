import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { traducirExpediente } from "@/server/expedientes/traductor";
import { DICTAMEN_SINTETICO, EXTRACCION_SINTETICA, HECHOS_SINTETICOS, RESULTADO_CON_ZONA } from "@/test/expediente-sintetico";
import { renderWithProviders } from "@/test/render";
import { buildProjectTimeline } from "./lib/project-timeline";
import { ProjectOverview } from "./components/overview/project-overview";
import { ProjectPlans } from "./components/plans/project-plans";
import { ProjectSite } from "./components/site/project-site";
import { ResultsPage } from "../results/components/results-page";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_MOCK_LATENCY = "0";
});
vi.mock("next/navigation", async () => (await import("../results/test/navigation-mock")).navigationModule);

const ID = "exp-pueblo-ficticio-rla-0000-1";
const TIMEOUT = { timeout: 4000 };
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
const fetchSimulado = vi.fn(async (url: string) => {
  if (url.startsWith("/api/expedientes/")) return Response.json(expediente);
  if (url.startsWith("/api/expedientes")) return Response.json({ items: [expediente.project] });
  return new Response("{}", { status: 404 });
});

beforeEach(() => vi.stubGlobal("fetch", fetchSimulado));
afterEach(() => vi.unstubAllGlobals());

/** Textos que solo existen en la demostración: ninguno debe aparecer en un expediente. */
const DEMOSTRACION = [/Plano de ejemplo/, /Ir a Nuevo PreCheck/, /Sin planos cargados/, /no tiene un lote asociado/, /Lotes de demostración/, /Betania/, /Solicitante:/];
function sinDemostracion() {
  for (const t of DEMOSTRACION) expect(document.body.textContent).not.toMatch(t);
}

describe("Pestañas de un expediente real", () => {
  it("Resumen: documento, norma, conteo, avisos, lote leído del plano y solicitante «no consta»", async () => {
    renderWithProviders(<ProjectOverview projectId={ID} />);
    const resultados = await screen.findByRole("region", { name: "Resultados preliminares del PreCheck" }, TIMEOUT);
    expect(within(resultados).getByText("MIVIOT-AC-R160-2002")).toBeInTheDocument();
    expect(within(resultados).getByText(/^R3 \(leído del plano/)).toBeInTheDocument();
    const conteo = within(resultados).getByRole("list", { name: "Resultados por estado" });
    const cifra = (label: string) => within(conteo).getByText(label).closest("li")?.lastElementChild?.textContent;
    expect([cifra("No cumplen"), cifra("A revisar"), cifra("Agrupadas por zona"), cifra("Cumplen")]).toEqual(["1", "3", "2", "1"]);
    expect(within(resultados).getByText("Aviso de prueba")).toBeInTheDocument();

    const datos = screen.getByRole("region", { name: "Datos del proyecto" });
    expect(within(datos).getByText("no consta (no se expone en el PreCheck)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Datos del lote leídos del plano (no es el catastro de la ANATI)" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Datos del lote leídos del plano" })).toHaveTextContent("450 m²");

    const planos = screen.getByRole("region", { name: "Planos del expediente" });
    expect(planos).toHaveTextContent("1 documento con 3 páginas");
    expect(planos).toHaveTextContent("Pueblo Ficticio - RLA-0000-1.pdf");

    const historial = screen.getByRole("region", { name: "Historial" });
    expect(historial).toHaveTextContent("Revisado por el agente revisor-planos");
    expect(historial).toHaveTextContent("1 no cumple, 3 a revisar, 2 agrupadas por zona sin confirmar, 1 cumple");
    sinDemostracion();
  });

  it("Planos: el documento revisado con sus miniaturas y el PDF original, sin ejemplos ni carga", async () => {
    renderWithProviders(<ProjectPlans projectId={ID} />);
    const doc = await screen.findByRole("region", { name: "Documento revisado" }, TIMEOUT);
    expect(doc).toHaveTextContent("Pueblo Ficticio - RLA-0000-1.pdf");
    expect(within(doc).getByRole("link", { name: /Abrir el PDF original/ })).toHaveAttribute("href", `/api/expedientes/${ID}/documento`);
    const paginas = screen.getByRole("list", { name: "Páginas del documento" });
    expect(within(paginas).getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual([1, 2, 3].map((n) => `/api/expedientes/${ID}/paginas/${n}`));
    expect(within(paginas).getByRole("img", { name: "Página 1 · lámina A-101" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Plano de ejemplo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    sinDemostracion();
  });

  it("Lote: datos leídos del plano con confianza y fuente, sin mapa ni parcela de demostración", async () => {
    renderWithProviders(<ProjectSite projectId={ID} />);
    expect(await screen.findByRole("heading", { name: "Datos del lote leídos del plano (no es el catastro de la ANATI)" }, TIMEOUT)).toBeInTheDocument();
    const zona = screen.getByRole("list", { name: "Zonificación leída del plano" });
    expect(zona).toHaveTextContent("Confianza 70 % · bajo el mínimo del motor (85 %): requiere revisión");
    expect(zona).toHaveTextContent("Fuente: Pueblo Ficticio - RLA-0000-1.pdf, p. 1 (declarado)");
    expect(screen.getByRole("list", { name: "Datos del lote leídos del plano" })).toHaveTextContent("Confianza 90 %");
    expect(screen.queryByRole("region", { name: /Mapa/ })).not.toBeInTheDocument();
    expect(document.querySelector(".maplibregl-map, canvas")).toBeNull();
    sinDemostracion();
  });

  it("Resultados: las reglas agrupadas por zona van en una sola línea y siguen contando en «Requiere revisión»", async () => {
    renderWithProviders(<ResultsPage projectId={ID} />);
    const linea = await screen.findByTestId("linea-zona-por-confirmar", undefined, TIMEOUT);
    expect(linea).toHaveTextContent("2 reglas de otras zonas de la norma");
    expect(linea).toHaveTextContent("no oficial");
    expect(screen.queryByText("R1: altura")).not.toBeInTheDocument();
    expect(screen.getAllByRole("note").some((n) => /preliminar/i.test(n.textContent ?? ""))).toBe(true);
  });
});

describe("Pestañas de un expediente con dictamen del arquitecto revisor", () => {
  const conDictamen = traducirExpediente({
    slug: "pueblo-ficticio-rla-0000-1",
    carpeta: "Pueblo Ficticio  -  RLA-0000-1",
    resultado: RESULTADO_CON_ZONA,
    hechos: HECHOS_SINTETICOS,
    extraccion: EXTRACCION_SINTETICA,
    dictamen: DICTAMEN_SINTETICO,
    fecha: "2026-01-16T15:00:00.000Z",
  });
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/expedientes/")) return Response.json(conDictamen);
        if (url.startsWith("/api/expedientes")) return Response.json({ items: [conDictamen.project] });
        return new Response("{}", { status: 404 });
      }),
    ),
  );

  it("Resumen: conclusión y supuestos arriba, conteo del dictamen y el expediente sigue pendiente de revisión", async () => {
    renderWithProviders(<ProjectOverview projectId={ID} />);
    const resultados = await screen.findByRole("region", { name: "Resultados preliminares del PreCheck" }, TIMEOUT);
    expect(resultados).toHaveTextContent("Dictamen del arquitecto revisor (agente revisor-planos) · resultado no oficial");
    const conclusion = within(resultados).getByRole("region", { name: "Conclusión del arquitecto revisor" });
    expect(conclusion).toHaveTextContent("El anteproyecto no puede seguir tal como está");
    expect(conclusion).toHaveTextContent("Zona R3 asumida: declarada en el plano; sin CEUS");
    expect(within(resultados).getByText("R3 (asumida por el arquitecto revisor; sin CEUS)")).toBeInTheDocument();
    const conteo = within(resultados).getByRole("list", { name: "Resultados por estado" });
    const cifra = (label: string) => within(conteo).getByText(label).closest("li")?.lastElementChild?.textContent;
    expect([cifra("No cumplen"), cifra("Observaciones"), cifra("A revisar"), cifra("Agrupadas por zona"), cifra("Cumplen")]).toEqual(["2", "2", "0", "0", "1"]);
    expect(resultados).toHaveTextContent("12 descartadas por el motor (no se listan) + 2 que el arquitecto revisor dio por «No aplica»");
    expect(within(resultados).queryByText(/agrupadas siguen en/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Historial" })).toHaveTextContent("2 no cumplen, 2 observaciones, 0 a revisar, 1 cumple");
  });

  it("Resultados: los gráficos cuentan los estados del dictamen y no hay línea agrupada", async () => {
    renderWithProviders(<ResultsPage projectId={ID} />);
    expect(await screen.findByTestId("fuente-dictamen", undefined, TIMEOUT)).toHaveTextContent("Dictamen del arquitecto revisor (agente revisor-planos)");
    expect(screen.getByTestId("summary-ALL")).toHaveTextContent("5");
    expect(screen.getByTestId("summary-FAIL")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-WARNING")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-MANUAL_REVIEW")).toHaveTextContent("0");
    expect(screen.getByRole("region", { name: "Índice preliminar de cumplimiento" })).toHaveTextContent("20 %1 de 5 reglas evaluadas");
    expect(screen.queryByTestId("linea-zona-por-confirmar")).not.toBeInTheDocument();
    expect(screen.queryByText("R1: altura")).not.toBeInTheDocument();
    expect(screen.getAllByText("Motor: Requiere revisión").length).toBeGreaterThan(0);
  });
});

describe("Resultados: aviso de zonificación", () => {
  const base = traducirExpediente({ slug: "pueblo-ficticio-rla-0000-1", carpeta: "Pueblo Ficticio  -  RLA-0000-1", resultado: RESULTADO_CON_ZONA, hechos: HECHOS_SINTETICOS, extraccion: EXTRACCION_SINTETICA, dictamen: DICTAMEN_SINTETICO, fecha: "2026-01-16T15:00:00.000Z" });
  const servir = (avisos: string[]) => {
    const exp = { ...base, project: { ...base.project, expediente: { ...base.project.expediente!, avisos } } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/expedientes/")) return Response.json(exp);
        if (url.startsWith("/api/expedientes")) return Response.json({ items: [exp.project] });
        return new Response("{}", { status: 404 });
      }),
    );
  };

  it("un ZONA_DISCREPANTE sale arriba de los resultados, en lenguaje claro y sin el prefijo técnico", async () => {
    servir(["ZONA_DISCREPANTE: la zona usada ('R2', calculo) difiere de la que declara el plano ('R2-A').", "DATO_DUDOSO: proyecto.altura_m = 0"]);
    renderWithProviders(<ResultsPage projectId={ID} />);
    const aviso = await screen.findByTestId("aviso-zona", undefined, TIMEOUT);
    expect(aviso).toHaveTextContent("La zona usada ('R2', calculo) difiere de la que declara el plano ('R2-A').");
    expect(aviso).not.toHaveTextContent("ZONA_DISCREPANTE");
    expect(aviso).not.toHaveTextContent("DATO_DUDOSO");
    expect(screen.getByText("Revise la zonificación")).toBeInTheDocument();
  });

  it("sin avisos de zona no aparece el banner", async () => {
    servir(["aviso de prueba"]);
    renderWithProviders(<ResultsPage projectId={ID} />);
    await screen.findByTestId("fuente-dictamen", undefined, TIMEOUT);
    expect(screen.queryByTestId("aviso-zona")).not.toBeInTheDocument();
  });
});

describe("Historial de la demostración", () => {
  it("un proyecto sin solicitante no muestra «Solicitante:» vacío", () => {
    const [registro] = buildProjectTimeline({ ...expediente.project, origen: undefined, expediente: undefined, applicant: "" }, undefined);
    expect(registro.detail).toBeUndefined();
  });
});
