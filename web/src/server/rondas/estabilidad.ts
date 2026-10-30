import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { clasificarCorridas } from "@/features/compare/lib/clasificacion";
import { compararEjecuciones, contarEstados, contarFaltasEnPlano, datosEscritos, ejecucionDe, estabilidadDe, resumenPorModelo, type Ejecucion } from "@/features/compare/lib/comparacion";
import { datosQuePidenLasReglas } from "@/server/ia/revisar";
import { carpetaPreCheck, esIdPreCheck } from "@/server/prechecks/almacen";
import { leerPreCheckReal } from "@/server/prechecks/traducir";
import type { CorridaEstable, EstabilidadPlano, EstabilidadRondas, MedidasPlano } from "@/services/rondas/tipos";
import { archivoEstabilidad, leerRondas } from "./datos";

/**
 * Estabilidad entre corridas para /rondas y «Comparar modelos» (ADR-0015): por cada grupo de rondas y plano, cuánto
 * coinciden sus corridas terminadas (todas, entre modelos y entre las repeticiones de cada modelo), cuánto coincide
 * cada modelo con la mayoría y cómo se clasifica cada corrida. Usa las mismas funciones que la página de comparar, así
 * que las cifras son las mismas. Se calcula al recalcular las métricas y se guarda en web/.data/rondas-estabilidad.json:
 * leer cientos de PreCheck en cada visita a /rondas sería lento.
 */

/** Una corrida terminada que entra en el cálculo (sale de las métricas de rondas.py). */
export interface CorridaACalcular {
  grupo: string;
  plano: string;
  modelo: string;
  ronda: number;
  repeticion: number;
  precheckId: string;
  projectId: string | null;
}

/** Cuántos PreCheck se leen a la vez. */
const PARALELO = 6;

async function enParalelo<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida = new Array<R>(xs.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < xs.length) {
      const i = siguiente++;
      salida[i] = await f(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, trabajador));
  return salida;
}

/** Medidas de un conjunto de corridas del mismo plano (al menos una). */
function medir(ejecuciones: Ejecucion[]): MedidasPlano {
  const filas = compararEjecuciones(ejecuciones);
  const modelo = (i: number) => ejecuciones[i].modelo;
  return {
    corridas: ejecuciones.length,
    todas: estabilidadDe(ejecuciones, filas),
    entreModelos: estabilidadDe(ejecuciones, filas, (i, j) => modelo(i) !== modelo(j)),
    modelos: resumenPorModelo(ejecuciones, filas).map((r) => ({
      modelo: r.modelo ?? "Sin IA",
      corridas: r.corridas,
      entreRepeticiones: estabilidadDe(ejecuciones, filas, (i, j) => modelo(i) === r.modelo && modelo(j) === r.modelo),
      acuerdoMayoria: r.acuerdo,
      rango: r.rango,
      faltasEnPlano: r.faltasEnPlano,
    })),
  };
}

/**
 * Calcula la estabilidad de cada grupo × plano. `leer` devuelve la corrida lista para comparar (null si no se pudo
 * leer); en el servidor es `leerDelDisco`, en las pruebas una función propia. La clasificación de cada corrida se hace
 * contra todas las del plano en el grupo, de todos los modelos.
 */
export async function calcularEstabilidad(corridas: CorridaACalcular[], leer: (c: CorridaACalcular) => Promise<Ejecucion | null>): Promise<EstabilidadRondas> {
  const leidas = await enParalelo(corridas, PARALELO, (c) => leer(c).catch(() => null));
  const porPlano = new Map<string, { c: CorridaACalcular; e: Ejecucion }[]>();
  let sinLeer = 0;
  corridas.forEach((c, i) => {
    const e = leidas[i];
    if (!e) {
      sinLeer += 1;
      return;
    }
    const clave = `${c.grupo}\u0000${c.plano}`;
    porPlano.set(clave, [...(porPlano.get(clave) ?? []), { c, e: { ...e, modelo: c.modelo } }]);
  });
  const planos: EstabilidadPlano[] = [];
  for (const lista of porPlano.values()) {
    lista.sort((a, b) => a.c.modelo.localeCompare(b.c.modelo, "es") || a.c.ronda - b.c.ronda || a.c.repeticion - b.c.repeticion);
    const ejecuciones = lista.map((x) => x.e);
    const clasificacion = clasificarCorridas(ejecuciones);
    const sinSup = ejecuciones.filter((e) => !e.aviso);
    planos.push({
      grupo: lista[0].c.grupo,
      plano: lista[0].c.plano,
      corridas: lista.map(({ c, e }): CorridaEstable => {
        const k = clasificacion[e.projectId];
        return {
          precheckId: c.precheckId,
          projectId: c.projectId,
          ronda: c.ronda,
          modelo: c.modelo,
          repeticion: c.repeticion,
          nivel: k?.nivel ?? "sin_clasificar",
          puntaje: k?.puntaje ?? 0,
          motivos: k?.motivos ?? [],
          orientativa: k?.orientativa ?? true,
          superficial: Boolean(e.aviso),
          hallazgos: e.resultados.filter((r) => r.fueraDeCatalogo && r.status !== "NOT_APPLICABLE").length,
          datos: datosEscritos(e),
          noCumple: contarEstados(e).FAIL,
          faltasEnPlano: contarFaltasEnPlano(e),
        };
      }),
      todas: medir(ejecuciones),
      sinSuperficiales: sinSup.length === ejecuciones.length || !sinSup.length ? null : medir(sinSup),
    });
  }
  planos.sort((a, b) => a.grupo.localeCompare(b.grupo, "es", { numeric: true }) || a.plano.localeCompare(b.plano, "es"));
  return { generado: new Date().toISOString(), planos, sinLeer };
}

/**
 * Lee una corrida del disco con las mismas funciones que GET /api/prechecks/[id] (solo lectura). Los datos que piden
 * las reglas dependen solo de qué reglas aplican, así que se guardan por esa lista: muchas corridas del mismo plano
 * comparten la misma.
 */
export function lectorDelDisco(): (c: CorridaACalcular) => Promise<Ejecucion | null> {
  const pedidosPorReglas = new Map<string, Promise<string[]>>();
  const pedidosDe = async (id: string): Promise<string[]> => {
    const dir = carpetaPreCheck(id);
    const resultado = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, "resultado.json"), "utf8")) as { resultados?: { regla_id?: unknown }[] };
    const clave = [...new Set((resultado.resultados ?? []).map((r) => r.regla_id).filter((x): x is string => typeof x === "string"))].sort().join(",");
    let pedidos = pedidosPorReglas.get(clave);
    if (!pedidos) {
      pedidos = datosQuePidenLasReglas(dir).then((d) => d.map((x) => x.clave), () => []);
      pedidosPorReglas.set(clave, pedidos);
    }
    return pedidos;
  };
  return async (c) => {
    // El id viene de un archivo: solo se aceptan ids de PreCheck (sin rutas).
    if (!esIdPreCheck(c.precheckId)) return null;
    const real = await leerPreCheckReal(c.precheckId).catch(() => null);
    if (!real) return null;
    return ejecucionDe({
      // La clasificación usa este id como clave: el del PreCheck es único aunque dos corridas compartan proyecto.
      projectId: c.precheckId,
      precheckId: c.precheckId,
      nombre: real.project.name,
      modelo: c.modelo,
      fecha: real.estado.createdAt,
      ia: real.estado.ia ?? null,
      pedidos: await pedidosDe(c.precheckId).catch(() => []),
      project: real.project,
      precheck: real.precheck,
    });
  };
}

/** Escritura atómica (temporal + renombrar): quien lea a la vez ve el archivo viejo o el nuevo, nunca uno a medias. */
async function guardar(datos: EstabilidadRondas) {
  const destino = archivoEstabilidad();
  await mkdir(/* turbopackIgnore: true */ dirname(destino), { recursive: true });
  const tmp = `${destino}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify({ version: 1, ...datos }));
  await rename(/* turbopackIgnore: true */ tmp, destino);
}

/** Paso 2 de «Recalcular métricas»: con las métricas recién escritas, calcula y guarda la estabilidad. */
export async function recalcularEstabilidad(leer = lectorDelDisco()): Promise<{ planos: number; sinLeer: number }> {
  const { rondas } = await leerRondas();
  const corridas = rondas.flatMap((r) =>
    r.corridas.flatMap((c) =>
      c.terminada && c.precheckId
        ? [{ grupo: r.grupo, plano: c.plano, modelo: c.modelo, ronda: r.ronda, repeticion: c.repeticion, precheckId: c.precheckId, projectId: c.projectId }]
        : [],
    ),
  );
  const datos = await calcularEstabilidad(corridas, leer);
  await guardar(datos);
  return { planos: datos.planos.length, sinLeer: datos.sinLeer };
}
