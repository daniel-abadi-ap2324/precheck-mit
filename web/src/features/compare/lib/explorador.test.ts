import { describe, expect, it } from "vitest";
import type { CorridaEstable, CorridaRonda, EstabilidadModelo, EstabilidadPlano, GrupoRondas, MedidaPares, MedidasPlano, Ronda } from "@/services/rondas/tipos";
import { agrupar, aCsv, COLUMNAS_INICIALES, etiquetaRondas, filasDe, FILTROS_VACIOS, filtrarFilas, ordenar, seriePorGrupo, textoNiveles } from "./explorador";

const pares = (acuerdoCatalogo: number | null, n = 1, solapamientoHallazgos: number | null = null): MedidaPares => ({ acuerdoCatalogo, solapamientoHallazgos, pares: n });
const modelo = (m: string, corridas: number, rep: number | null, mayoria: number): EstabilidadModelo => ({
  modelo: m,
  corridas,
  entreRepeticiones: pares(rep, rep === null ? 0 : 1, rep),
  acuerdoMayoria: mayoria,
  rango: { PASS: [1, 2], FAIL: [0, 1], WARNING: [0, 0], MANUAL_REVIEW: [0, 0] },
  faltasEnPlano: [0, 1],
});
const corrida = (precheckId: string, m: string, ronda: number, extra: Partial<CorridaEstable> = {}): CorridaEstable => ({
  precheckId,
  projectId: `prj-${precheckId}`,
  ronda,
  modelo: m,
  repeticion: 1,
  nivel: "estandar",
  puntaje: 0,
  motivos: [],
  orientativa: true,
  superficial: false,
  hallazgos: 4,
  datos: { n: 8, total: 10 },
  noCumple: 1,
  faltasEnPlano: 0,
  ...extra,
});
const medidas = (modelos: EstabilidadModelo[]): MedidasPlano => ({ corridas: modelos.reduce((a, m) => a + m.corridas, 0), todas: pares(0.9, 3, 0.5), entreModelos: pares(0.85, 2), modelos });

const PLANOS: EstabilidadPlano[] = [
  {
    grupo: "r43-45",
    plano: "Casco",
    corridas: [corrida("o1", "Opus 5.5", 43), corrida("o2", "Opus 5.5", 44), corrida("s1", "Sonnet 5.5", 43, { superficial: true, nivel: "desviante", hallazgos: 0 })],
    todas: medidas([modelo("Opus 5.5", 2, 0.95, 0.9), modelo("Sonnet 5.5", 1, null, 0.7)]),
    sinSuperficiales: { ...medidas([modelo("Opus 5.5", 2, 0.95, 1)]), corridas: 2 },
  },
  { grupo: "r59", plano: "Casco", corridas: [corrida("o3", "Opus 5.5", 59), corrida("o4", "Opus 5.5", 59, { repeticion: 2 })], todas: medidas([modelo("Opus 5.5", 2, 0.8, 0.8)]), sinSuperficiales: null },
  { grupo: "r43-45", plano: "Tocumen", corridas: [corrida("t1", "Opus 5.5", 45)], todas: { ...medidas([modelo("Opus 5.5", 1, null, 1)]), corridas: 1 }, sinSuperficiales: null },
];
const metrica = (precheckId: string, usd: number): CorridaRonda =>
  ({ plano: "", modelo: "", proveedor: null, precheckId, projectId: null, repeticion: 1, fecha: "2026-10-13T10:00:00Z", terminada: true, error: null, usd, minutos: 10, decisiones: 30, lectura: null, dictamen: { contradiceMotor: 0, informacionRequerida: 2, externasSinEstado: 0 }, deepseek: null }) as CorridaRonda;
const ronda = (n: number, corridas: CorridaRonda[], etapa: Ronda["etapa"] = "comparativa") => ({ ronda: n, titulo: `Ronda ${n}`, etapa, corridas }) as unknown as Ronda;
const RONDAS = [ronda(43, [metrica("o1", 4), metrica("s1", 2)]), ronda(44, [metrica("o2", 6)]), ronda(45, [metrica("t1", 5)]), ronda(59, [metrica("o3", 7), metrica("o4", 9)], "deepseek")];
const GRUPOS: GrupoRondas[] = [
  { id: "r43-45", rondas: [43, 44, 45], titulo: "Comparar los cinco modelos", agrupada: true },
  { id: "r59", rondas: [59], titulo: "Ronda 59", agrupada: false },
];

describe("estabilidad por ronda", () => {
  const filas = filasDe(PLANOS, RONDAS, GRUPOS);

  it("una fila por grupo × plano × modelo, con el costo y los minutos de las métricas de sus corridas", () => {
    expect(filas.map((f) => f.clave)).toEqual(["r43-45|Casco|Opus 5.5", "r43-45|Casco|Sonnet 5.5", "r59|Casco|Opus 5.5", "r43-45|Tocumen|Opus 5.5"]);
    expect(filas[0]).toMatchObject({ rondas: [43, 44, 45], titulo: "Comparar los cinco modelos", etapa: "comparativa", corridas: 2, acuerdoRepeticiones: 0.95, acuerdoEntreModelos: 0.85, acuerdoMayoria: 0.9, usd: 5, infoRequerida: 2, datos: 0.8, projectIds: ["prj-o1", "prj-o2"] });
    expect(filas[1]).toMatchObject({ acuerdoRepeticiones: null, superficiales: 1, niveles: { desviante: 1, estandar: 0 } });
    expect(filas[2]).toMatchObject({ etapa: "deepseek", usd: 8 });
    // Con una sola corrida en el plano no hay mayoría con que comparar.
    expect(filas[3].acuerdoMayoria).toBeNull();
  });

  it("sin las superficiales: medidas de la variante y esas corridas fuera de los totales", () => {
    const sin = filasDe(PLANOS, RONDAS, GRUPOS, true);
    expect(sin.filter((f) => f.plano === "Casco" && f.grupo === "r43-45").map((f) => f.modelo)).toEqual(["Opus 5.5"]);
    expect(sin[0].acuerdoMayoria).toBe(1);
    // Un plano sin superficiales queda igual.
    expect(sin.find((f) => f.grupo === "r59")?.acuerdoRepeticiones).toBe(0.8);
  });

  it("filtra por plano, modelo, rango de rondas (primera del grupo), repeticiones y texto", () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, planos: ["Casco"], modelos: ["Opus 5.5"] })).toHaveLength(2);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, desde: 50 })).toHaveLength(1);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, soloConRepeticiones: true })).toHaveLength(2);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, texto: "cinco" })).toHaveLength(3);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, etapas: ["deepseek"] })).toHaveLength(1);
  });

  it("agrupa promediando las filas y sumando corridas y clasificación", () => {
    const porModelo = agrupar(filas, "modelo");
    const opus = porModelo.find((r) => r.modelo === "Opus 5.5");
    expect(opus).toMatchObject({ n: 3, corridas: 5, grupo: null, rondas: null, plano: null });
    expect(opus?.acuerdoRepeticiones).toBeCloseTo((0.95 + 0.8) / 2);
    expect(opus?.niveles.estandar).toBe(5);
    const grupoModelo = agrupar(filas, "grupo-modelo").find((r) => r.clave === "r43-45|Opus 5.5");
    expect(grupoModelo).toMatchObject({ n: 2, rondas: [43, 44, 45], plano: null, corridas: 3 });
  });

  it("ordena por rondas con los vacíos al final y exporta CSV con porcentajes", () => {
    const rs = agrupar(filas, "fila");
    expect(ordenar(rs, "rondas", false)[0].grupo).toBe("r59");
    expect(ordenar(rs, "acuerdoRepeticiones", false).map((r) => r.acuerdoRepeticiones)).toEqual([0.95, 0.8, null, null]);
    const csv = aCsv(rs.slice(0, 1), COLUMNAS_INICIALES);
    expect(csv.split("\n")[0]).toBe("Rondas,Plano,Modelo,Corridas,Se repite (reglas) (%),Se repite (hallazgos) (%),Con la mayoría (%),Clasificación,USD,Min");
    expect(csv.split("\n")[1]).toBe("43–45,Casco,Opus 5.5,2,95,95,90,2 estándar,5,10");
    expect(csv).not.toMatch(/exactitud/i);
  });

  it("serie por grupo: promedio de los planos, solo los grupos con dato", () => {
    const s = seriePorGrupo(filas, "acuerdoRepeticiones");
    expect(s).toEqual([{ modelo: "Opus 5.5", puntos: [{ grupo: "r43-45", x: 43, etiqueta: "43–45", valor: 0.95, planos: 1 }, { grupo: "r59", x: 59, etiqueta: "59", valor: 0.8, planos: 1 }] }]);
  });

  it("textos", () => {
    expect(etiquetaRondas([59])).toBe("59");
    expect(textoNiveles({ estandar: 2, desviante: 1, rarisimo: 0, sin_clasificar: 1 })).toBe("2 estándar · 1 desviante · 1 sin clasificar");
  });
});
