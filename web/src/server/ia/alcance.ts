/**
 * Paso 1 de la revisión (reglas vigentes) visto desde la web: lee la ficha del paso 0 (alcance_base.json), la lista
 * cerrada que deja el motor (reglas_a_evaluar.json) y lo que falta para cerrar el alcance, en un resumen corto que va a
 * la IA. El motor (precheck/planos/alcance.py) es quien comprueba las citas y aplica el alcance; aquí solo se lee.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO } from "@/server/planos/procesar";

export const ARCHIVO_IA = "alcance_ia.json";

interface FichaBase {
  norma_declarada?: string | null;
  normas_candidatas?: string[];
  zona?: { usuario?: string | null; plano?: string | null; discrepan?: boolean; aviso?: string | null };
  documentos?: { archivo: string; nombre?: string | null; tipo_probable?: string }[];
  solo_si_existe?: string[];
}

export interface ListaCerrada {
  norma_aplicable?: string | null;
  codigo_zona?: string | null;
  alcance_ia?: { presente?: boolean; aplicado?: string[]; errores?: string[]; no_fijados?: string[] };
  permisos?: { id: string; tipo?: string; efecto?: { regla_id: string; accion: string }[] }[];
  total?: number;
  reglas?: { regla_id: string; resultado: string }[];
  sin_determinar?: string[];
  exceptuadas?: unknown[];
  /** ADR-0016: zona con que evaluó el motor y si es firme o un supuesto. */
  zona_trabajo?: { codigo?: string | null; norma?: string | null; procedencia?: string | null; firme?: boolean; explicacion?: string | null; supuesto?: string | null };
}

/** «Zona de trabajo del motor: R1d1 (MIVIOT-AC-R160-2002), SUPUESTA (S1): …; confírmala o corrígela con fuente.» */
export function textoZonaTrabajo(zt: ListaCerrada["zona_trabajo"]): string {
  if (!zt) return "";
  if (!zt.codigo) return `- Zona de trabajo del motor: ninguna. ${zt.explicacion ?? ""} Las reglas de zonificación quedan en información requerida hasta que fijes la zona con fuente en alcance_ia.json.`.trim();
  const estado = zt.firme ? "firme" : `SUPUESTA${zt.supuesto ? ` (${zt.supuesto})` : ""}`;
  const pedido = zt.firme
    ? ""
    : " El motor supuso esta zona: confírmala o corrígela con fuente (CEUS, nota DPU o Documento Gráfico leído con las coordenadas del lote) en alcance_ia.json. Mientras sea un supuesto, las reglas de zonificación traen la decisión de respaldo del motor y puedes cambiarlas (no las bloquea la jerarquía).";
  return `- Zona de trabajo del motor: ${zt.codigo}${zt.norma ? ` (${zt.norma})` : ""}, ${estado}. ${zt.explicacion ?? ""}${pedido}`.trim();
}

const leer = async <T>(ruta: string): Promise<T | null> => readFile(/* turbopackIgnore: true */ ruta, "utf8").then((t) => JSON.parse(t) as T, () => null);
export const leerFicha = (dir: string) => leer<FichaBase>(join(/* turbopackIgnore: true */ dir, "alcance_base.json"));
export const leerLista = (dir: string) => leer<ListaCerrada>(join(/* turbopackIgnore: true */ dir, "reglas_a_evaluar.json"));

/** Claves del `aplica_si` de cada regla pedida (las que deciden si aplica), según los catálogos de reglas/. */
export async function clavesDeAplicaSi(ids: Set<string>, carpetaReglas = join(REPO, "reglas")): Promise<Map<string, string[]>> {
  const salida = new Map<string, string[]>();
  if (!ids.size) return salida;
  for (const nombre of (await readdir(/* turbopackIgnore: true */ carpetaReglas)).filter((n) => n.endsWith(".json"))) {
    const d = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaReglas, nombre), "utf8")) as unknown;
    const lista = Array.isArray(d) ? d : Array.isArray((d as { reglas?: unknown })?.reglas) ? (d as { reglas: unknown[] }).reglas : [];
    for (const r of lista as { id?: string; aplica_si?: unknown }[])
      if (r?.id && ids.has(r.id) && typeof r.aplica_si === "string") salida.set(r.id, [...new Set([...r.aplica_si.matchAll(/\b([a-z_]+\.[a-z_][a-z0-9_.]*)/g)].map((m) => m[1]))]);
  }
  return salida;
}

/** Los datos de alcance que piden las reglas cuyo alcance no se puede determinar, con cuántas reglas espera cada uno. */
export async function datosParaDeterminar(lista: ListaCerrada | null, carpetaReglas?: string): Promise<{ clave: string; reglas: number }[]> {
  const ids = new Set(lista?.sin_determinar ?? []);
  const cuenta = new Map<string, number>();
  for (const claves of (await clavesDeAplicaSi(ids, carpetaReglas).catch(() => new Map<string, string[]>())).values())
    for (const c of claves) if (!/^(lote\.(norma_aplicable|codigo_zona|sf_sector|sf_unidad_territorial)|tramite|expediente\.fecha_presentacion)$/.test(c)) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  return [...cuenta.entries()].map(([clave, reglas]) => ({ clave, reglas })).sort((a, b) => b.reglas - a.reglas || a.clave.localeCompare(b.clave));
}

/** Ficha del paso 0 en pocas líneas para el mensaje inicial (la lista completa de datos de alcance no cabe: 120 claves). */
export async function textoFicha(dir: string): Promise<string> {
  const [base, lista] = await Promise.all([leerFicha(dir), leerLista(dir)]);
  if (!base) return "";
  const z = base.zona ?? {};
  const faltan = await datosParaDeterminar(lista);
  return [
    "FICHA DE ALCANCE (paso 0, alcance_base.json):",
    `- Norma declarada: ${base.norma_declarada ?? "ninguna"}. Normas candidatas por el código de zona: ${(base.normas_candidatas ?? []).join(", ") || "ninguna"}.`,
    `- Zona del usuario: ${z.usuario ?? "sin dato"}; zona leída en el plano: ${z.plano ?? "sin leer"}${z.discrepan ? " (NO COINCIDEN)" : ""}.${z.aviso ? ` Aviso: ${z.aviso}` : ""}`,
    textoZonaTrabajo(lista?.zona_trabajo),
    base.documentos?.length ? `- Documentos complementarios: ${base.documentos.map((d) => `${d.archivo.replace(/\.pdf$/i, "")} («${d.nombre ?? ""}», tipo probable: ${d.tipo_probable ?? "otro"})`).join("; ")}.` : "- Sin documentos complementarios.",
    lista ? `- Reglas vigentes ahora: ${lista.total ?? 0}; ${lista.sin_determinar?.length ?? 0} sin poder determinar si aplican.` : "",
    faltan.length ? `- Datos de alcance que faltan para determinarlas (entre paréntesis, cuántas reglas esperan cada uno): ${faltan.slice(0, 40).map((d) => `${d.clave} (${d.reglas})`).join(", ")}.` : "",
    base.solo_si_existe?.length ? `- Datos que solo cuentan si existen (escribir false los quita: las reglas que los excluyen aplican): ${base.solo_si_existe.slice(0, 15).join(", ")}${base.solo_si_existe.length > 15 ? "…" : ""}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lo que vuelve a la IA después de fijar el alcance y reevaluar: qué se aplicó, qué no y qué falta. */
export async function resumenDelAlcance(dir: string): Promise<{ aceptado: boolean; texto: string; errores: string[] }> {
  const lista = await leerLista(dir);
  if (!lista) return { aceptado: false, texto: "El motor no escribió reglas_a_evaluar.json: no se pudo comprobar el alcance.", errores: ["sin lista"] };
  const errores = lista.alcance_ia?.errores ?? [];
  const faltan = await datosParaDeterminar(lista);
  const resumen = {
    aceptado: errores.length === 0,
    norma: lista.norma_aplicable,
    zona: lista.codigo_zona,
    ...(lista.zona_trabajo ? { zona_de_trabajo: textoZonaTrabajo(lista.zona_trabajo).replace(/^- /, "") } : {}),
    aplicado: lista.alcance_ia?.aplicado ?? [],
    errores,
    // Sector o UT con confianza ≤ 0.6: no entran y no es un error que corregir (no se pide subir la confianza).
    ...(lista.alcance_ia?.no_fijados?.length ? { no_fijados: lista.alcance_ia.no_fijados } : {}),
    permisos: (lista.permisos ?? []).map((p) => ({ id: p.id, tipo: p.tipo, efecto: (p.efecto ?? []).map((e) => `${e.accion} ${e.regla_id}`) })),
    reglas_vigentes: lista.total ?? 0,
    sin_determinar: (lista.sin_determinar ?? []).slice(0, 40),
    datos_de_alcance_que_faltan: faltan.slice(0, 30),
    siguiente: errores.length ? "Corrige lo que no se aceptó (cita literal de la página, norma registrada, dato de alcance válido) y vuelve a fijar el alcance completo." : "Alcance aceptado: sigue con el paso 2 sobre estas reglas vigentes.",
  };
  return { aceptado: resumen.aceptado, texto: JSON.stringify(resumen), errores };
}

/**
 * Cobertura del paso 2: reglas vigentes que el motor deja en REQUIERE_REVISION (resultado.json tras la última
 * evaluación) y que el dictamen no decide. Las de otras zonas o UT no cuentan: son NO_APLICA sin listarlas.
 */
export async function reglasSinDecision(dir: string, decididas: Iterable<unknown>): Promise<string[]> {
  const resultado = await leer<{ resultados?: { regla_id?: string; resultado?: string; grupo?: string }[] }>(join(/* turbopackIgnore: true */ dir, "resultado.json"));
  const hechas = new Set([...decididas].filter((x): x is string => typeof x === "string"));
  return (resultado?.resultados ?? [])
    .filter((r) => r.resultado === "REQUIERE_REVISION" && r.grupo !== "zona_por_confirmar" && typeof r.regla_id === "string" && !hechas.has(r.regla_id))
    .map((r) => r.regla_id as string);
}

/** Escribe alcance_ia.json (reemplaza el anterior: cada llamada trae el alcance completo). */
export async function escribirAlcance(dir: string, alcance: Record<string, unknown>): Promise<void> {
  await writeFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, ARCHIVO_IA), JSON.stringify(alcance, null, 1));
}
