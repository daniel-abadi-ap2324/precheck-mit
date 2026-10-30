import { describe, expect, it } from "vitest";
import type { ComplianceResult } from "@/types";
import { cambiosDeLaIa, clasificarCorridas, coincideFiltros, detalleDeCorrida, diaLocal, FILTROS_VACIOS, filtrosActivos, rondaDe, type Filtros } from "./clasificacion";
import { DATOS_CLAVE, datosEscritos, type Ejecucion } from "./comparacion";

const datos = (n: number) => Object.fromEntries(DATOS_CLAVE.slice(0, n).map((k) => [k, { valor: "1" }]));
const hall = (i: number) => ({ ruleId: `HALLAZGO-T${i}`, status: "FAIL" as const, fueraDeCatalogo: true });
const titulosDe = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`HALLAZGO-T${i}`, `Hallazgo ${i}`]));

/** Una corrida con las mismas reglas del catálogo y `nHall` hallazgos (de los 12 comunes). */
function corrida(id: string, opciones: { nHall?: number; datos?: number; catalogo?: Record<string, "PASS" | "FAIL" | "WARNING">; aviso?: string } = {}): Ejecucion {
  const catalogo = opciones.catalogo ?? { "R-1": "PASS", "R-2": "FAIL", "R-3": "WARNING", "R-4": "PASS", "R-5": "PASS" };
  return {
    projectId: id,
    nombre: `Plano - prueba con ${id}`,
    modelo: "m",
    iaTerminada: true,
    aviso: opciones.aviso,
    resultados: [...Object.entries(catalogo).map(([ruleId, status]) => ({ ruleId, status })), ...Array.from({ length: opciones.nHall ?? 10 }, (_, i) => hall(i))],
    titulos: titulosDe(12),
    datos: datos(opciones.datos ?? 10),
  };
}

describe("clasificarCorridas", () => {
  it("con menos de 3 corridas no clasifica", () => {
    const r = clasificarCorridas([corrida("a"), corrida("b")]);
    expect(r.a.nivel).toBe("sin_clasificar");
    expect(r.a.orientativa).toBe(true);
  });

  it("las corridas parecidas son estándar y no dan motivos de alarma", () => {
    const r = clasificarCorridas(["a", "b", "c", "d", "e", "f"].map((id) => corrida(id)));
    expect(Object.values(r).every((x) => x.nivel === "estandar")).toBe(true);
    expect(r.a.motivos).toEqual(["Se parece a la mayoría de las corridas de este plano."]);
    expect(r.a.orientativa).toBe(false);
  });

  it("una corrida con casi nada (1 hallazgo, 2 datos, catálogo distinto) es rarísima y dice por qué", () => {
    const normales = ["a", "b", "c", "d", "e"].map((id) => corrida(id));
    const rara = corrida("z", { nHall: 1, datos: 2, catalogo: { "R-1": "FAIL", "R-2": "PASS", "R-3": "PASS", "R-4": "FAIL", "R-5": "WARNING" } });
    const r = clasificarCorridas([...normales, rara]);
    expect(r.z.nivel).toBe("rarisimo");
    expect(r.z.puntaje).toBeGreaterThanOrEqual(3.5);
    expect(r.z.motivos.join(" ")).toMatch(/Propone 1 hallazgo fuera del catálogo \(lo habitual: 10\)/);
    expect(r.z.motivos.join(" ")).toMatch(/Escribió el 15 % de los datos que piden las reglas de su plano/);
    expect(r.a.nivel).toBe("estandar");
  });

  it("una diferencia pequeña no se exagera aunque todas las demás sean idénticas (dispersión mínima)", () => {
    const r = clasificarCorridas([...["a", "b", "c", "d", "e"].map((id) => corrida(id)), corrida("f", { nHall: 9 })]);
    expect(r.f.nivel).toBe("estandar");
  });

  it("el aviso de revisión superficial la vuelve, como mínimo, desviante", () => {
    const r = clasificarCorridas([...["a", "b", "c", "d"].map((id) => corrida(id)), corrida("s", { aviso: "x" })]);
    expect(r.s.nivel).toBe("desviante");
    expect(r.s.motivos.some((m) => m.includes("superficial"))).toBe(true);
  });

  it("mide más allá de una desviación: 6 hallazgos de menos es desviante o más", () => {
    const r = clasificarCorridas([...["a", "b", "c", "d", "e"].map((id) => corrida(id)), corrida("g", { nHall: 4 })]);
    expect(["desviante", "rarisimo"]).toContain(r.g.nivel);
  });
});

describe("filtros", () => {
  const base = { nombre: "Casco Antiguo - prueba 3 con Opus 5.5", modelo: "claude-opus-5-5", fecha: "2026-10-06T15:00:00", nivel: "estandar" as const };
  const con = (f: Partial<Filtros>): Filtros => ({ ...FILTROS_VACIOS, ...f });

  it("sin filtros deja pasar todo y no cuenta filtros activos", () => {
    expect(coincideFiltros(base, FILTROS_VACIOS)).toBe(true);
    expect(filtrosActivos(FILTROS_VACIOS)).toBe(0);
  });

  it("filtra por modelo, ronda, texto y nivel", () => {
    expect(coincideFiltros(base, con({ modelos: ["claude-opus-5-5"] }))).toBe(true);
    expect(coincideFiltros(base, con({ modelos: ["claude-fable-5-1"] }))).toBe(false);
    expect(coincideFiltros(base, con({ ronda: 3 }))).toBe(true);
    expect(coincideFiltros(base, con({ ronda: 4 }))).toBe(false);
    expect(coincideFiltros(base, con({ ronda: 2, rondaEnAdelante: true }))).toBe(true);
    expect(coincideFiltros(base, con({ ronda: 3, rondaEnAdelante: true }))).toBe(true);
    expect(coincideFiltros(base, con({ ronda: 4, rondaEnAdelante: true }))).toBe(false);
    expect(coincideFiltros(base, con({ texto: "CASCO  antiguo" }))).toBe(true);
    expect(coincideFiltros(base, con({ texto: "bella vista" }))).toBe(false);
    expect(coincideFiltros(base, con({ niveles: ["rarisimo"] }))).toBe(false);
    expect(coincideFiltros({ ...base, nivel: "rarisimo" }, con({ niveles: ["rarisimo", "desviante"] }))).toBe(true);
  });

  it("filtra por fecha (día local, ambos extremos incluidos) y deja fuera lo que no tiene fecha", () => {
    const dia = diaLocal(base.fecha);
    expect(coincideFiltros(base, con({ desde: dia, hasta: dia }))).toBe(true);
    expect(coincideFiltros(base, con({ desde: "2099-01-01" }))).toBe(false);
    expect(coincideFiltros(base, con({ hasta: "2000-01-01" }))).toBe(false);
    expect(coincideFiltros({ ...base, fecha: null }, con({ desde: "2000-01-01" }))).toBe(false);
    expect(coincideFiltros({ ...base, fecha: null }, FILTROS_VACIOS)).toBe(true);
  });

  it("deja fuera las superficiales si se pide", () => {
    expect(coincideFiltros({ ...base, aviso: "x" }, con({ sinSuperficiales: true }))).toBe(false);
    expect(coincideFiltros({ ...base, aviso: "x" }, FILTROS_VACIOS)).toBe(true);
  });

  it("rondaDe: 1 sin número, N con número y null si no es una prueba de modelos", () => {
    expect(rondaDe("Casco Antiguo - prueba con Opus 5.5")).toBe(1);
    expect(rondaDe("Casco Antiguo - prueba 4 con Fable 5.1")).toBe(4);
    expect(rondaDe("Casco Antiguo - manual 1")).toBeNull();
  });
});

describe("detalleDeCorrida", () => {
  const r = (parcial: Partial<ComplianceResult> & { ruleId: string }): ComplianceResult => ({ status: "PASS", ...parcial }) as ComplianceResult;
  const resultados = [
    r({ ruleId: "R-motor", status: "FAIL" }),
    r({ ruleId: "R-ia-cambia", status: "PASS", motorStatus: "MANUAL_REVIEW", motorReason: "dato faltante", dictamen: { decision: "CUMPLE", justificacion: "600 m² ≥ 450 m²", valorLeido: "600", limite: "450", evidencia: [] } }),
    r({ ruleId: "R-ia-igual", status: "FAIL", motorStatus: "FAIL", dictamen: { decision: "NO_CUMPLE", justificacion: "Coincide", evidencia: [] } }),
    r({ ruleId: "HALLAZGO-X", status: "FAIL", fueraDeCatalogo: true, dictamen: { decision: "NO_CUMPLE", justificacion: "Faltan láminas", subsanar: "Agregar", evidencia: [] } }),
  ];
  const filas = detalleDeCorrida(resultados, { "R-motor": "Regla del motor" });

  it("separa lo que determinó el motor de lo que decidió la IA", () => {
    expect(filas[0]).toMatchObject({ titulo: "Regla del motor", motor: "FAIL", ia: null });
    expect(filas[1]).toMatchObject({ motor: "MANUAL_REVIEW", motorMotivo: "dato faltante", ia: "PASS", justificacion: "600 m² ≥ 450 m²", valorLeido: "600", limite: "450" });
    expect(filas[3]).toMatchObject({ fueraDeCatalogo: true, motor: null, ia: "FAIL", subsanar: "Agregar" });
  });

  it("cuenta las reglas en que la IA cambió lo que dijo el motor", () => {
    expect(cambiosDeLaIa(filas)).toBe(1);
  });
});

describe("datos que piden las reglas del plano", () => {
  it("se mide contra la lista de cada plano y, sin ella, contra la lista fija", () => {
    const con = (pedidos?: string[], escritos: string[] = []): Parameters<typeof datosEscritos>[0] => ({ pedidos, datos: Object.fromEntries(escritos.map((k) => [k, { valor: "1" }])) });
    expect(datosEscritos(con(["a.x", "b.y", "c.z"], ["a.x", "c.z", "otro"]))).toEqual({ n: 2, total: 3 });
    expect(datosEscritos(con(undefined, [DATOS_CLAVE[0]]))).toEqual({ n: 1, total: DATOS_CLAVE.length });
    expect(datosEscritos(con([], []))).toEqual({ n: 0, total: DATOS_CLAVE.length });
  });
});
