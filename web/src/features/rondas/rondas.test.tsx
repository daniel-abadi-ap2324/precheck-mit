import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/config/brand";
import { renderWithProviders } from "@/test/render";
import type { CorridaEstable, CorridaRonda, EstabilidadModelo, EstabilidadPlano, GrupoRondas, MedidaPares, RespuestaRondas, Ronda } from "@/services/rondas/tipos";
import type { Project } from "@/types";
import { tramos } from "./components/lista-cambios";
import { RondasPage, RondasVista } from "./components/rondas-page";
import { PALABRAS_PROHIBIDAS } from "./lib/glosario";
import { anclaPlano, carpetaDeCorridas, etiquetaGrupo, gruposVista, textosDeGrupo, ultimoConRepeticiones } from "./lib/rondas";

const corrida = (c: Partial<CorridaRonda> & Pick<CorridaRonda, "plano" | "modelo">): CorridaRonda => ({
  proveedor: "claude-code",
  precheckId: null,
  projectId: null,
  repeticion: 1,
  fecha: null,
  terminada: true,
  error: null,
  usd: null,
  minutos: null,
  decisiones: null,
  dictamen: { contradiceMotor: 0, informacionRequerida: 3, externasSinEstado: 0 },
  deepseek: null,
  ...c,
});
const ronda = (r: Partial<Ronda> & Pick<Ronda, "ronda">): Ronda => ({
  documentada: true,
  fecha: "2026-10-12",
  tanda: null,
  titulo: null,
  cambioCorto: null,
  efecto: null,
  cambio: null,
  hipotesis: null,
  resultado: null,
  modelos: [],
  planos: [],
  informe: null,
  commits: [],
  etapa: null,
  grupo: `r${r.ronda}`,
  corridas: [],
  ...r,
});
const pares = (acuerdoCatalogo: number | null, n: number, solapamientoHallazgos: number | null = null): MedidaPares => ({ acuerdoCatalogo, solapamientoHallazgos, pares: n });
const medidaModelo = (modelo: string, corridas: number, rep: number | null, mayoria: number): EstabilidadModelo => ({
  modelo,
  corridas,
  entreRepeticiones: pares(rep, rep === null ? 0 : 1, rep === null ? null : 0.5),
  acuerdoMayoria: mayoria,
  rango: { PASS: [1, 2], FAIL: [0, 1], WARNING: [0, 0], MANUAL_REVIEW: [0, 0] },
  faltasEnPlano: [0, 0],
});
const estable = (precheckId: string, modelo: string, ronda: number, extra: Partial<CorridaEstable> = {}): CorridaEstable => ({
  precheckId,
  projectId: `prj-${precheckId}`,
  ronda,
  modelo,
  repeticion: 1,
  nivel: "estandar",
  puntaje: 0,
  motivos: [],
  orientativa: true,
  superficial: false,
  hallazgos: 3,
  datos: { n: 8, total: 10 },
  noCumple: 1,
  faltasEnPlano: 0,
  ...extra,
});

// Grupo 43–44: Sonnet repite Bella Vista (95 %) y Opus corre una sola vez. Ronda 36 suelta, ronda 38 sin documentar.
const c = (precheckId: string, modelo: string, extra: Partial<CorridaRonda> = {}) => corrida({ plano: "Bella Vista", modelo, precheckId, projectId: `prj-${precheckId}`, ...extra });
const RONDAS: Ronda[] = [
  ronda({ ronda: 36, etapa: "linea-base", titulo: "Línea base", modelos: ["Sonnet 5.5"], planos: ["Bella Vista"], corridas: [c("s36", "Sonnet 5.5", { usd: 3 })] }),
  ronda({
    ronda: 43,
    grupo: "r43-44",
    etapa: "comparativa",
    titulo: "Comparación (1 de 2)",
    cambioCorto: "Los modelos con el mismo sistema.",
    efecto: "Sonnet se repite casi siempre.",
    cambio: "Prevalece el motor sobre la IA",
    informe: "docs/demo/comparativa.md",
    commits: ["9b1e3d6"],
    modelos: ["Sonnet 5.5", "Opus 5.5"],
    planos: ["Bella Vista"],
    corridas: [c("s43", "Sonnet 5.5", { usd: 2, minutos: 12 }), c("o43", "Opus 5.5", { usd: 6 })],
  }),
  ronda({
    ronda: 44,
    grupo: "r43-44",
    etapa: "comparativa",
    titulo: "Comparación (2 de 2)",
    cambioCorto: "Repetición de la ronda 43.",
    efecto: "Ver ronda 43.",
    modelos: ["Sonnet 5.5", "Opus 5.5"],
    planos: ["Bella Vista"],
    corridas: [c("s44", "Sonnet 5.5", { usd: 2, repeticion: 1 }), c("o44", "Opus 5.5", { terminada: false, error: "límite de uso", projectId: null })],
  }),
  ronda({ ronda: 38, documentada: false, corridas: [corrida({ plano: "Tocumen", modelo: "Sonnet 5.5", usd: 1.5 })] }),
].sort((a, b) => a.ronda - b.ronda);
const GRUPOS: GrupoRondas[] = [
  { id: "r36", rondas: [36], titulo: "Línea base", agrupada: false },
  { id: "r38", rondas: [38], titulo: null, agrupada: false },
  { id: "r43-44", rondas: [43, 44], titulo: "Comparación de modelos", agrupada: true },
];
const PLANO_43: EstabilidadPlano = {
  grupo: "r43-44",
  plano: "Bella Vista",
  corridas: [estable("s43", "Sonnet 5.5", 43), estable("s44", "Sonnet 5.5", 44), estable("o43", "Opus 5.5", 43, { nivel: "rarisimo", superficial: true })],
  todas: { corridas: 3, todas: pares(0.9, 3), entreModelos: pares(0.85, 2), modelos: [medidaModelo("Sonnet 5.5", 2, 0.95, 0.97), medidaModelo("Opus 5.5", 1, null, 0.8)] },
  sinSuperficiales: null,
};

const DATOS: RespuestaRondas = {
  rondas: RONDAS,
  grupos: GRUPOS,
  planos: ["Bella Vista", "Tocumen"],
  modelos: ["Sonnet 5.5", "Opus 5.5"],
  generado: "2026-10-13T12:00:00Z",
  catalogoGenerado: null,
  estabilidad: { generado: "2026-10-13T12:05:00Z", planos: [PLANO_43], sinLeer: 0 },
  faltantes: { catalogo: false, metricas: false },
  avisos: [],
};

/** Abre todas las etapas de «Cómo llegamos aquí» y, si se pide, las cifras de cada grupo. */
const abrirTodo = (cifras = false) => {
  screen.getAllByRole("button", { expanded: false }).forEach((b) => b.closest("#cambios") && fireEvent.click(b));
  if (cifras) screen.getAllByRole("button", { name: "Ver cifras de este grupo" }).forEach((b) => fireEvent.click(b));
};

describe("lib de rondas", () => {
  const grupos = gruposVista(RONDAS, GRUPOS, DATOS.estabilidad);

  it("grupos del más reciente al más antiguo, con su resumen por modelo y la conclusión del último con repeticiones", () => {
    expect(grupos.map((g) => g.grupo.id)).toEqual(["r43-44", "r38", "r36"]);
    const [g] = grupos;
    expect(g).toMatchObject({ etapa: "comparativa", conRepeticiones: true });
    expect(g.corridas).toHaveLength(4);
    expect(g.modelos.map((m) => m.modelo)).toEqual(["Sonnet 5.5", "Opus 5.5"]);
    expect(g.modelos[0]).toMatchObject({ corridas: 2, seRepite: 0.95, hallazgosRepiten: 0.5, conMayoria: 0.97, usd: 2, niveles: { estandar: 2 } });
    expect(g.modelos[1]).toMatchObject({ seRepite: null, superficiales: 1, niveles: { rarisimo: 1 }, usd: 6 });
    expect(ultimoConRepeticiones(grupos)?.grupo.id).toBe("r43-44");
    expect(ultimoConRepeticiones(gruposVista(RONDAS, GRUPOS, null))).toBeNull();
  });

  it("los textos del grupo salen de su primera ronda; «Ver ronda N» no es un resultado", () => {
    expect(textosDeGrupo(grupos[0])).toEqual({ cambio: "Los modelos con el mismo sistema.", resultado: "Sonnet se repite casi siempre." });
    const soloVer = { ...grupos[0], rondas: [{ ...RONDAS[2], efecto: "Ver ronda 43." }] };
    expect(textosDeGrupo(soloVer).resultado).toBeNull();
  });

  it("carpeta: por plano, una fila por grupo con las corridas de cada modelo en orden y su clasificación", () => {
    const carpeta = carpetaDeCorridas(grupos);
    expect(carpeta.map((p) => [p.plano, p.corridas])).toEqual([
      ["Bella Vista", 5],
      ["Tocumen", 1],
    ]);
    const bv = carpeta[0];
    expect(bv.filas.map((f) => f.grupo.id)).toEqual(["r43-44", "r36"]);
    expect(bv.filas[0].celdas.get("Sonnet 5.5")?.map((x) => [x.ronda, x.nivel])).toEqual([
      [43, "estandar"],
      [44, "estandar"],
    ]);
    expect(bv.filas[0].celdas.get("Opus 5.5")?.[0]).toMatchObject({ nivel: "rarisimo", superficial: true });
    expect(anclaPlano("Tocumen (comercial)")).toBe("corridas-tocumen-comercial");
    expect(anclaPlano("Panamá Norte")).toBe("corridas-panama-norte");
  });

  it("textos", () => {
    expect(etiquetaGrupo([43, 44, 45])).toBe("43–45");
    expect(etiquetaGrupo([59])).toBe("59");
    expect(etiquetaGrupo([9, 12])).toBe("9, 12");
    expect(tramos([1, 2, 3])).toBe("1 a 3");
    expect(tramos([31, 34, 35, 36, 39])).toBe("31, 34 a 36 y 39");
  });
});

describe("RondasVista", () => {
  const OTRA = { id: "prj-web-000000000001", name: "Bella Vista - manual 2 con Opus 5.5", updatedAt: "2026-10-15T10:00:00Z" } as Project;

  it("conclusión por estabilidad, tabla por grupo, lista de cambios por grupo y la carpeta de corridas", () => {
    renderWithProviders(<RondasVista datos={DATOS} otras={[OTRA]} />);
    const conclusion = screen.getByRole("region", { name: "Conclusión" });
    expect(within(conclusion).getByText(/rondas 43–44/)).toBeInTheDocument();
    const modelos = within(conclusion).getByTestId("conclusion-modelos");
    expect(modelos).toHaveTextContent("Sonnet 5.5: entre sus repeticiones dice lo mismo en el 95 % de las reglas y en el 50 % de los hallazgos; coincide con la mayoría de las corridas en el 97 %; 2.00 USD por revisión (2 corridas).");
    expect(modelos).toHaveTextContent("Opus 5.5: una sola corrida por plano");
    expect(conclusion).toHaveTextContent("Todavía no hay una referencia confirmada");

    const tabla = screen.getByTestId("estabilidad-grupos");
    expect(within(tabla).getAllByRole("row")).toHaveLength(2);
    expect(within(tabla).getByText("95 %")).toBeInTheDocument();

    // Los grupos empiezan cerrados dentro de su etapa; sus cifras solo se cargan al pedirlas.
    const lista = screen.getByRole("region", { name: "Cómo llegamos aquí" });
    expect(within(lista).queryByText("Los modelos con el mismo sistema.")).not.toBeInTheDocument();
    abrirTodo(true);
    expect(within(lista).getAllByText("Los modelos con el mismo sistema.").length).toBeGreaterThan(0);
    expect(within(lista).getByTestId("se-repite-grupo")).toHaveTextContent("Sonnet 5.5 95 %");
    const tarjeta = within(lista).getByRole("article", { name: /^Rondas 43–44/ });
    expect(within(tarjeta).getByText("docs/demo/comparativa.md")).toBeInTheDocument();
    const enlace = within(tarjeta).getByRole("link", { name: /abrir la corrida 2 de Bella Vista con Sonnet 5\.5, ronda 44/ });
    expect(enlace).toHaveAttribute("href", "/projects/prj-s44/precheck");
    expect(within(tarjeta).getByText("no terminó")).toBeInTheDocument();
    expect(within(lista).getAllByText("Sin documentar").length).toBeGreaterThan(0);

    const carpeta = screen.getByRole("region", { name: "Corridas de prueba" });
    expect(within(carpeta).getByRole("link", { name: "Bella Vista (5)" })).toHaveAttribute("href", "#corridas-bella-vista");
    // Cada plano y las «otras» están plegados (jsdom los da por ocultos).
    const comparar = carpeta.querySelector('a[href^="/projects/compare"]');
    expect(comparar).toHaveTextContent("Comparar las corridas de rondas 43–44 de Bella Vista");
    expect(comparar).toHaveAttribute("href", "/projects/compare?ids=prj-s43,prj-s44,prj-o43");
    expect(within(within(carpeta).getByTestId("otras-corridas")).getByRole("link", { name: OTRA.name, hidden: true })).toHaveAttribute("href", `/projects/${OTRA.id}/precheck`);
  });

  it("ningún texto de la página habla de exactitud", () => {
    const { container } = renderWithProviders(<RondasVista datos={DATOS} />);
    abrirTodo(true);
    expect(container.textContent).not.toMatch(/exactitud/i);
  });

  it("sin estabilidad medida, la conclusión pide recalcular", () => {
    renderWithProviders(<RondasVista datos={{ ...DATOS, estabilidad: null }} />);
    expect(screen.getByRole("region", { name: "Conclusión" })).toHaveTextContent("Todavía no se midió cuánto se parecen las corridas entre sí.");
  });

  it("sin métricas ni catálogo explica cómo generarlos", () => {
    renderWithProviders(<RondasVista datos={{ ...DATOS, rondas: [], generado: null, faltantes: { catalogo: true, metricas: true } }} />);
    expect(screen.getAllByText(/python scripts\/analisis\/rondas\.py/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Falta docs\/demo\/rondas\.json/)).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay rondas")).toBeInTheDocument();
  });
});

describe("RondasPage", () => {
  const fetchSimulado = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/rondas/recalcular" && init?.method === "POST")
      return Response.json({ generado: "2026-10-13T12:00:00Z", rondas: 3, corridas: 5, salida: "", estabilidad: { planos: 4, sinLeer: 1 } });
    if (url === "/api/rondas") return Response.json(DATOS);
    return new Response("{}", { status: 404 });
  });
  beforeEach(() => vi.stubGlobal("fetch", fetchSimulado));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSimulado.mockClear();
  });

  it("lee las rondas, muestra la nota preliminar y recalcula las métricas y la estabilidad", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RondasPage />);
    expect(await screen.findByRole("region", { name: "Cómo llegamos aquí" })).toBeInTheDocument();
    expect(screen.getByText(brand.preliminaryNotice)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recalcular métricas" }));
    expect(await screen.findByText(/3 rondas con 5 corridas.*Estabilidad: 4 planos medidos, 1 corridas sin leer/)).toBeInTheDocument();
    await waitFor(() => expect(fetchSimulado.mock.calls.filter(([u]) => u === "/api/rondas").length).toBeGreaterThan(1));
  });
});

describe("vocabulario de la página", () => {
  it("con el catálogo real, ningún texto visible fuera del «Detalle técnico» usa jerga sin definir", () => {
    const catalogo = JSON.parse(readFileSync(join(process.cwd(), "..", "docs", "demo", "rondas.json"), "utf8")) as {
      rondas: Partial<Ronda>[];
      grupos: { rondas: number[]; titulo?: string }[];
    };
    const rondas = catalogo.rondas.map((r) => ronda({ ...r, ronda: r.ronda as number, corridas: [] }));
    const grupoDe = new Map(catalogo.grupos.flatMap((g) => g.rondas.map((n) => [n, `r${g.rondas[0]}-${g.rondas[g.rondas.length - 1]}`] as const)));
    for (const r of rondas) r.grupo = grupoDe.get(r.ronda) ?? `r${r.ronda}`;
    const grupos: GrupoRondas[] = [...new Set(rondas.map((r) => r.grupo))].map((id) => {
      const rs = rondas.filter((r) => r.grupo === id).map((r) => r.ronda);
      return { id, rondas: rs, titulo: catalogo.grupos.find((g) => g.rondas[0] === rs[0])?.titulo ?? null, agrupada: rs.length > 1 };
    });
    const { container } = renderWithProviders(<RondasVista datos={{ ...DATOS, rondas, grupos }} />);
    abrirTodo();
    container.querySelectorAll('[data-testid="detalle-tecnico"]').forEach((d) => d.remove());
    const texto = (container.textContent ?? "").toLowerCase();
    const encontradas = PALABRAS_PROHIBIDAS.filter((p) => texto.includes(p.toLowerCase()));
    expect(encontradas).toEqual([]);
  });
});
