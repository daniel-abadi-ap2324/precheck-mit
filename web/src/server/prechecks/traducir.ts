import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage, PreCheck, PreCheckProgress, Project } from "@/types";
import { leerDictamenCrudo } from "@/server/expedientes/almacen";
import { traducirExpediente } from "@/server/expedientes/traductor";
import { carpetaDe, esComplementario } from "@/server/planos/almacen";
import { carpetaPreCheck, DICTAMEN_PARCIAL, leerEstadoPreCheck, type EstadoPreCheck } from "./almacen";

const leer = async (ruta: string): Promise<unknown> => JSON.parse(await readFile(/* turbopackIgnore: true */ ruta, "utf8"));
const opcional = (ruta: string) => leer(ruta).catch(() => undefined);

/** Avance que ve la pantalla de procesamiento: el motor es rápido, así que son pocas etapas reales. */
export function progresoDe(estado: EstadoPreCheck, totalReglas = 0): PreCheckProgress {
  const etapa = (stage: PipelineStage, percent: number): PreCheckProgress => ({ stage, percent, ruleIndex: percent >= 100 ? totalReglas : 0, ruleTotal: totalReglas });
  if (estado.status === "queued") return etapa("reading", 15);
  if (estado.status === "running") return etapa("checks", 60);
  return etapa("done", 100);
}

export interface PreCheckReal {
  estado: EstadoPreCheck;
  project: Project;
  precheck: PreCheck;
  avisos: string[];
}

/** PDF original del plano evaluado (el primero de los planos del PreCheck que lo conserve). */
export async function pdfOriginal(estado: EstadoPreCheck): Promise<string | null> {
  for (const id of estado.planIds) {
    if (await esComplementario(id)) continue;
    const ruta = join(/* turbopackIgnore: true */ carpetaDe(id), "original.pdf");
    if (await stat(/* turbopackIgnore: true */ ruta).then((s) => s.isFile(), () => false)) return ruta;
  }
  return null;
}

/** `total_cost_usd` de la última línea «result» de ia.log.jsonl (Claude Code y DeepSeek lo escriben); vacío si no hay. */
export async function costoDelRegistro(ruta: string): Promise<{ costoUsd?: number }> {
  const texto = await readFile(/* turbopackIgnore: true */ ruta, "utf8").catch(() => "");
  for (const linea of texto.split("\n").reverse()) {
    if (!linea.includes("total_cost_usd")) continue;
    try {
      const o = JSON.parse(linea) as { total_cost_usd?: unknown };
      if (typeof o.total_cost_usd === "number") return { costoUsd: o.total_cost_usd };
    } catch {
      // Una línea cortada no invalida el registro.
    }
  }
  return {};
}

/** Traduce resultado.json (y dictamen.json si hay) con el mismo traductor de los expedientes, con los ids del proyecto web. */
export async function leerPreCheckReal(id: string): Promise<PreCheckReal | null> {
  const estado = await leerEstadoPreCheck(id).catch(() => null);
  if (!estado || estado.status !== "done") return null;
  const dir = carpetaPreCheck(id);
  const ruta = (a: string) => join(/* turbopackIgnore: true */ dir, a);
  const [resultado, hechos, lote, extraccion, completo, info] = await Promise.all([
    leer(ruta("resultado.json")),
    opcional(ruta("hechos.json")),
    opcional(ruta("lote.json")),
    opcional(ruta("extraccion.json")),
    leerDictamenCrudo(ruta("dictamen.json"), id),
    stat(/* turbopackIgnore: true */ ruta("resultado.json")),
  ]);
  // ADR-0016: si la IA falló, el informe se arma igual, con lo que alcanzó a decidir (dictamen.parcial.json) y la
  // decisión de respaldo del motor, y dice qué falló.
  const iaFallo = estado.ia?.status === "failed";
  const parcial = !completo && iaFallo ? await leerDictamenCrudo(ruta(DICTAMEN_PARCIAL), id) : undefined;
  const dictamen = completo ?? parcial;
  const { project, precheck, avisos } = traducirExpediente({
    slug: id,
    carpeta: estado.datos.nombreProyecto,
    resultado,
    hechos: hechos ?? lote,
    extraccion,
    informe: null,
    fecha: info.mtime.toISOString(),
    dictamen,
  });
  // Proveedor y modelo de la revisión (estado.json) y su costo: el dictamen de la API y de DeepSeek lo traen; el de Claude
  // Code queda en la línea «result» de ia.log.jsonl.
  const dictamenInfo = project.expediente?.dictamen
    ? {
        ...project.expediente.dictamen,
        ...(estado.ia?.proveedor ? { proveedor: estado.ia.proveedor } : {}),
        ...(project.expediente.dictamen.modelo ? {} : estado.ia?.modelo ? { modelo: estado.ia.modelo } : {}),
        ...(project.expediente.dictamen.costoUsd === undefined ? await costoDelRegistro(ruta("ia.log.jsonl")) : {}),
      }
    : project.expediente?.dictamen;
  const miniaturas = (await readdir(/* turbopackIgnore: true */ dir).catch(() => []))
    .map((n) => /^p([1-9]\d{0,2})\.png$/.exec(n)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number)
    .sort((a, b) => a - b);
  const pdf = await pdfOriginal(estado);
  const iaFallida =
    iaFallo && !completo
      ? {
          error: estado.ia?.error?.trim() || "la revisión con IA falló sin dar el motivo",
          decididasPorMotor: precheck.results.filter((r) => r.dictamen?.origen === "motor").length,
          parcial: Boolean(parcial && project.expediente?.dictamen),
        }
      : null;
  return {
    estado,
    avisos: avisos ?? [],
    project: {
      ...project,
      id: estado.projectId,
      name: estado.datos.nombreProyecto,
      precheckId: id,
      // La zona de trabajo del motor (ADR-0016) manda sobre la que se indicó al crear el PreCheck: ya la tuvo en cuenta.
      zoningCode: project.expediente?.zonaTrabajo?.codigo ?? estado.datos.codigoZona ?? project.zoningCode,
      ...(project.expediente ? { expediente: { ...project.expediente, dictamen: dictamenInfo, miniaturas, documentoDisponible: Boolean(pdf), ...(iaFallida ? { iaFallida } : {}) } } : {}),
    },
    precheck: {
      ...precheck,
      id,
      projectId: estado.projectId,
      startedAt: estado.createdAt,
      finishedAt: estado.updatedAt,
      engineVersion: dictamen ? "motor de reglas + PreCheck IA" : "motor de reglas (reglas en borrador)",
      informeRevisor: null,
    },
  };
}
