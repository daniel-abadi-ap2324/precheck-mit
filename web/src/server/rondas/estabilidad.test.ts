// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ejecucionDe, type Ejecucion } from "@/features/compare/lib/comparacion";
import { traducirExpediente } from "@/server/expedientes/traductor";
import type { ComplianceStatus } from "@/types";
import { leerRondas } from "./datos";
import { calcularEstabilidad, lectorDelDisco, recalcularEstabilidad, type CorridaACalcular } from "./estabilidad";

const HALLAZGO = "IA-COTA";
/** Una corrida con dos reglas del catálogo (R1, R2) y, si se pide, un hallazgo propio con el mismo título en todas. */
const ejecucion = (id: string, r1: ComplianceStatus, r2: ComplianceStatus, { hallazgo = false, aviso }: { hallazgo?: boolean; aviso?: string } = {}): Ejecucion => ({
  projectId: id,
  precheckId: id,
  nombre: id,
  modelo: "id-crudo-del-modelo",
  iaTerminada: true,
  aviso,
  pedidos: ["lote.area_m2", "proyecto.altura_m"],
  datos: { "lote.area_m2": { valor: "600" } },
  resultados: [
    { ruleId: "R1", status: r1 },
    { ruleId: "R2", status: r2, faltaEnPlano: r2 === "FAIL" },
    ...(hallazgo ? [{ ruleId: HALLAZGO, status: "FAIL" as const, fueraDeCatalogo: true }] : []),
  ],
  titulos: { R1: "Retiro frontal", R2: "Cuadro de áreas", [HALLAZGO]: "Falta la cota del retiro posterior" },
});

const corrida = (precheckId: string, modelo: string, ronda: number, repeticion: number, plano = "Tocumen"): CorridaACalcular => ({ grupo: "r43-45", plano, modelo, ronda, repeticion, precheckId, projectId: `prj-${precheckId}` });

const LEIDAS: Record<string, Ejecucion> = {
  o1: ejecucion("o1", "PASS", "FAIL", { hallazgo: true }),
  o2: ejecucion("o2", "PASS", "FAIL", { hallazgo: true }),
  o3: ejecucion("o3", "PASS", "PASS", { hallazgo: true }),
  s1: ejecucion("s1", "PASS", "FAIL"),
  s2: ejecucion("s2", "FAIL", "FAIL", { aviso: "Revisión posiblemente superficial" }),
  b1: ejecucion("b1", "PASS", "PASS"),
};
const leer = async (c: CorridaACalcular) => LEIDAS[c.precheckId] ?? null;

const CORRIDAS = [
  corrida("s2", "Sonnet 5.5", 44, 1),
  corrida("o1", "Opus 5.5", 43, 1),
  corrida("o2", "Opus 5.5", 44, 1),
  corrida("o3", "Opus 5.5", 45, 1),
  corrida("s1", "Sonnet 5.5", 43, 1),
  corrida("borrada", "Opus 5.5", 45, 2),
  corrida("b1", "Opus 5.5", 43, 1, "Bella Vista"),
];

describe("calcularEstabilidad", () => {
  it("por grupo y plano: todas, entre modelos y entre repeticiones de cada modelo", async () => {
    const r = await calcularEstabilidad(CORRIDAS, leer);
    expect(r.sinLeer).toBe(1);
    expect(r.planos.map((p) => p.plano)).toEqual(["Bella Vista", "Tocumen"]);
    const t = r.planos[1];
    // Orden: modelo, ronda, repetición.
    expect(t.corridas.map((c) => c.precheckId)).toEqual(["o1", "o2", "o3", "s1", "s2"]);
    expect(t.todas.corridas).toBe(5);
    expect(t.todas.todas.pares).toBe(10);
    expect(t.todas.entreModelos.pares).toBe(6);
    const opus = t.todas.modelos.find((m) => m.modelo === "Opus 5.5");
    const sonnet = t.todas.modelos.find((m) => m.modelo === "Sonnet 5.5");
    // Opus: R2 cambia en una de tres → pares 1, ½ y ½; el hallazgo lo proponen las tres.
    expect(opus?.entreRepeticiones).toEqual({ acuerdoCatalogo: expect.closeTo(2 / 3), solapamientoHallazgos: 1, pares: 3 });
    // Sonnet: R1 cambia; ninguna propone hallazgos, así que no hay solapamiento que medir.
    expect(sonnet?.entreRepeticiones).toEqual({ acuerdoCatalogo: 0.5, solapamientoHallazgos: null, pares: 1 });
    expect(opus?.faltasEnPlano).toEqual([0, 1]);
    expect(opus?.rango.FAIL).toEqual([1, 2]);
  });

  it("clasifica cada corrida y repite las medidas sin las superficiales", async () => {
    const t = (await calcularEstabilidad(CORRIDAS, leer)).planos[1];
    const s2 = t.corridas.find((c) => c.precheckId === "s2");
    expect(s2).toMatchObject({ modelo: "Sonnet 5.5", ronda: 44, repeticion: 1, superficial: true, orientativa: true, projectId: "prj-s2", noCumple: 2, faltasEnPlano: 1, datos: { n: 1, total: 2 } });
    // Superficial = como mínimo desviante.
    expect(["desviante", "rarisimo"]).toContain(s2?.nivel);
    expect(t.corridas.find((c) => c.precheckId === "o1")).toMatchObject({ hallazgos: 1, superficial: false });
    expect(t.sinSuperficiales?.corridas).toBe(4);
    expect(t.sinSuperficiales?.todas.pares).toBe(6);
    expect(t.sinSuperficiales?.modelos.find((m) => m.modelo === "Sonnet 5.5")?.entreRepeticiones.pares).toBe(0);
  });

  it("con una sola corrida: sin pares, sin clasificar y sin variante sin superficiales", async () => {
    const b = (await calcularEstabilidad(CORRIDAS, leer)).planos[0];
    expect(b.todas.todas).toEqual({ acuerdoCatalogo: null, solapamientoHallazgos: null, pares: 0 });
    expect(b.corridas[0].nivel).toBe("sin_clasificar");
    expect(b.sinSuperficiales).toBeNull();
  });

  it("un error al leer una corrida cuenta como no leída, no tumba el cálculo", async () => {
    const r = await calcularEstabilidad([corrida("o1", "Opus 5.5", 43, 1), corrida("x", "Opus 5.5", 43, 2)], async (c) => {
      if (c.precheckId === "x") throw new Error("disco");
      return LEIDAS[c.precheckId];
    });
    expect(r.sinLeer).toBe(1);
    expect(r.planos).toHaveLength(1);
  });
});

describe("decisión de respaldo del motor (ADR-0016)", () => {
  // Tres corridas del mismo plano: la IA decide R1 y deja R2 y R3 sin decidir. En las corridas nuevas el motor trae su
  // decisión de respaldo para R2 y R3 (distinta en cada corrida para R2, igual para R3); en las viejas, no.
  const resultado = (respaldo: { R2: string; R3: string } | null) => ({
    norma_aplicable: "N",
    codigo_zona: "Z",
    resultados: [
      { regla_id: "R1", resultado: "REQUIERE_REVISION", titulo: "Retiro" },
      { regla_id: "R2", resultado: "REQUIERE_REVISION", titulo: "Estacionamientos", ...(respaldo ? { decision_motor: { resultado: respaldo.R2, motivo: "dato dudoso", con_supuesto: ["S1"] } } : {}) },
      { regla_id: "R3", resultado: "REQUIERE_REVISION", titulo: "Curvas", tipo: "documental", ...(respaldo ? { decision_motor: { resultado: respaldo.R3, motivo: "falta en el plano" } } : {}) },
    ],
    ...(respaldo ? { supuestos: [{ id: "S1", tipo: "dato_dudoso", campo: "proyecto.estacionamientos", reglas: ["R2"] }] } : {}),
  });
  const dictamen = (r1: string) => ({ decisiones: [{ regla_id: "R1", decision: r1, justificacion: "leído en el plano" }] });
  const corridaDe = (id: string, modelo: string, r1: string, respaldo: { R2: string; R3: string } | null): Ejecucion => {
    const { project, precheck } = traducirExpediente({ slug: id, carpeta: "Tocumen", resultado: resultado(respaldo), fecha: "2026-10-01T00:00:00Z", dictamen: dictamen(r1) });
    return ejecucionDe({ projectId: id, precheckId: id, nombre: id, modelo, ia: { modelo, status: "done" }, project, precheck });
  };
  const PLAN = [
    ["a", "Opus 5.5", "CUMPLE", { R2: "OBSERVACION", R3: "NO_CUMPLE" }],
    ["b", "Opus 5.5", "NO_CUMPLE", { R2: "NO_CUMPLE", R3: "NO_CUMPLE" }],
    ["c", "Sonnet 5.5", "CUMPLE", { R2: "CUMPLE", R3: "NO_CUMPLE" }],
  ] as const;
  const corridas = PLAN.map(([id, modelo], i) => corrida(id, modelo, 43 + i, 1));
  const medir = (conRespaldo: boolean) =>
    calcularEstabilidad(corridas, async (c) => {
      const [id, modelo, r1, respaldo] = PLAN.find((p) => p[0] === c.precheckId)!;
      return corridaDe(id, modelo, r1, conRespaldo ? respaldo : null);
    }).then((r) => ({ planos: r.planos, sinLeer: r.sinLeer }));

  it("el informe sí la muestra: estado final con origen «motor» y NO_CUMPLE con supuesto", () => {
    const { precheck } = traducirExpediente({ slug: "a", carpeta: "Tocumen", resultado: resultado({ R2: "NO_CUMPLE", R3: "NO_CUMPLE" }), fecha: "2026-10-01T00:00:00Z" });
    const r2 = precheck.results.find((r) => r.ruleId === "R2");
    expect(r2).toMatchObject({ status: "FAIL", conSupuesto: true, motorStatus: "MANUAL_REVIEW", dictamen: { origen: "motor", supuestos: ["S1"] } });
    expect(precheck.results.find((r) => r.ruleId === "R3")).toMatchObject({ status: "FAIL", faltaEnPlano: true, dictamen: { origen: "motor" } });
  });

  it("las métricas comparan solo las decisiones de la IA: con o sin respaldo dan las mismas cifras", async () => {
    const sin = await medir(false);
    const con = await medir(true);
    expect(con).toEqual(sin);
    // R3 tiene el mismo respaldo en las tres corridas, pero no suma acuerdo: se compara como «Requiere revisión», igual
    // que en las rondas viejas, y R2 (respaldo distinto en cada corrida) tampoco resta.
    const t = con.planos[0];
    expect(t.corridas.map((c) => c.noCumple)).toEqual([0, 1, 0]);
    expect(t.corridas.map((c) => c.faltasEnPlano)).toEqual([0, 0, 0]);
  });

  it("ejecucionDe compara el estado previo al respaldo", () => {
    const e = corridaDe("a", "Opus 5.5", "CUMPLE", { R2: "NO_CUMPLE", R3: "NO_CUMPLE" });
    expect(e.resultados).toEqual([
      { ruleId: "R1", status: "PASS", fueraDeCatalogo: undefined, faltaEnPlano: undefined },
      { ruleId: "R2", status: "MANUAL_REVIEW", fueraDeCatalogo: undefined, faltaEnPlano: undefined },
      { ruleId: "R3", status: "MANUAL_REVIEW", fueraDeCatalogo: undefined, faltaEnPlano: undefined },
    ]);
  });
});

describe("lectorDelDisco", () => {
  it("no lee ids que no son de PreCheck (vienen de un archivo)", async () => {
    expect(await lectorDelDisco()(corrida("../../etc", "Opus 5.5", 1, 1))).toBeNull();
  });
});

describe("recalcularEstabilidad", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rondas-estabilidad-"));
    process.env.RONDAS_CATALOGO = join(dir, "rondas.json");
    process.env.RONDAS_METRICAS = join(dir, "metricas.json");
    process.env.RONDAS_ESTABILIDAD = join(dir, "sub", "estabilidad.json");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.RONDAS_CATALOGO;
    delete process.env.RONDAS_METRICAS;
    delete process.env.RONDAS_ESTABILIDAD;
  });

  it("toma las corridas terminadas de las métricas por grupo, guarda el archivo y /api/rondas lo devuelve", async () => {
    writeFileSync(join(dir, "rondas.json"), JSON.stringify({ grupos: [{ rondas: [43, 44] }], rondas: [{ ronda: 43 }, { ronda: 44 }] }));
    const c = (precheckId: string, modelo: string, extra = {}) => ({ plano: "Tocumen", modelo, precheckId, projectId: null, terminada: true, ...extra });
    writeFileSync(
      join(dir, "metricas.json"),
      JSON.stringify({ rondas: [{ ronda: 43, corridas: [c("o1", "Opus 5.5"), c("s1", "Sonnet 5.5"), c("zz", "Opus 5.5", { terminada: false })] }, { ronda: 44, corridas: [c("o2", "Opus 5.5", { repeticion: 2 })] }] }),
    );
    const vistas: string[] = [];
    const resumen = await recalcularEstabilidad(async (x) => {
      vistas.push(`${x.precheckId}@${x.grupo}#${x.repeticion}`);
      return LEIDAS[x.precheckId] ?? null;
    });
    expect(resumen).toEqual({ planos: 1, sinLeer: 0 });
    expect(vistas.sort()).toEqual(["o1@r43-44#1", "o2@r43-44#2", "s1@r43-44#1"]);
    expect(JSON.parse(readFileSync(join(dir, "sub", "estabilidad.json"), "utf8"))).toMatchObject({ version: 1, sinLeer: 0 });
    const datos = await leerRondas();
    expect(datos.estabilidad?.planos[0]).toMatchObject({ grupo: "r43-44", plano: "Tocumen", todas: { corridas: 3 } });
    expect(datos.avisos).toEqual([]);
  });

  it("un archivo de estabilidad dañado o con un plano mal formado: aviso, nunca un 500", async () => {
    writeFileSync(join(dir, "rondas.json"), JSON.stringify({ rondas: [{ ronda: 1 }] }));
    process.env.RONDAS_ESTABILIDAD = join(dir, "estabilidad.json");
    writeFileSync(join(dir, "estabilidad.json"), "{ roto");
    let datos = await leerRondas();
    expect(datos.estabilidad).toBeNull();
    expect(datos.avisos.join("\n")).toMatch(/rondas-estabilidad\.json no es un JSON válido/);
    writeFileSync(join(dir, "estabilidad.json"), JSON.stringify({ generado: "x", sinLeer: 0, planos: [{ grupo: "r1" }] }));
    datos = await leerRondas();
    expect(datos.estabilidad).toEqual({ generado: "x", sinLeer: 0, planos: [] });
    expect(datos.avisos.join("\n")).toMatch(/1 plano\(s\) mal formado/);
  });
});
