/**
 * Qué quedó pendiente al terminar una revisión con IA y por qué, leído de `resultado.json` (lo que el motor decidió con los
 * datos que dejó la IA). Sirve para la «segunda pasada dirigida»: si quedan datos que SÍ se pueden escribir, el servidor
 * reabre la sesión y pide solo eso. Lo que no se arregla escribiendo datos (reglas de criterio, tolerancia, zona por
 * confirmar, errores del motor) se cuenta aparte y no cuenta para decidir si hay segunda pasada.
 *
 * El motor no da la clave del dato en un campo propio: está dentro del texto de `motivo` (precheck/motor/evaluador.py). Los
 * textos que se reconocen están fijados en `tests/test_motivos_pendientes.py`, que corre el motor real, para que un cambio
 * de redacción allí rompa una prueba y no deje la segunda pasada sin avisar.
 */

/** Datos que no se leen del plano: los fija el trámite, el usuario o el expediente (no se piden a la IA). */
export const DATOS_AJENOS_AL_PLANO = /^(lote\.norma_aplicable|lote\.codigo_zona|tramite|expediente\.|registro_publico\.|solicita_uso_acera$)/;

export type ClaseDeMotivo = "escribible" | "criterio" | "tolerancia" | "zona" | "error" | "otro";

export interface ReglaEvaluada {
  regla_id?: string;
  resultado?: string;
  motivo?: string;
  grupo?: string;
  motivo_tipo?: string;
}

export interface Pendiente {
  clave: string;
  /** El primer motivo con que el motor dejó una regla en revisión por falta de este dato. */
  motivo: string;
  reglas: string[];
}

export interface Pendientes {
  /** Datos que la IA puede escribir (faltan o tienen confianza bajo el mínimo), de los más usados a los menos. */
  datos: Pendiente[];
  /** Reglas en revisión que no se arreglan escribiendo datos. */
  noEscribibles: Record<Exclude<ClaseDeMotivo, "escribible">, number>;
}

const CLAVE_EN_MOTIVO = /(?:dato faltante: |falta |la confianza de )([A-Za-z_][\w.]*)/g;

/** Clase del motivo de una regla en revisión y las claves de dato que menciona (solo si es escribible). */
export function clasificarMotivo(r: ReglaEvaluada): { clase: ClaseDeMotivo; claves: string[] } {
  const motivo = r.motivo ?? "";
  if (r.grupo === "zona_por_confirmar" || r.motivo_tipo === "zona_por_confirmar") return { clase: "zona", claves: [] };
  if (/^regla de criterio/i.test(motivo)) return { clase: "criterio", claves: [] };
  if (/dentro de la tolerancia/i.test(motivo)) return { clase: "tolerancia", claves: [] };
  if (/^error al evaluar/i.test(motivo)) return { clase: "error", claves: [] };
  const claves = [...new Set([...motivo.matchAll(CLAVE_EN_MOTIVO)].map((m) => m[1]))].filter((k) => !DATOS_AJENOS_AL_PLANO.test(k));
  return claves.length ? { clase: "escribible", claves } : { clase: "otro", claves: [] };
}

/** Pendientes de un `resultado.json` ya leído. Solo cuentan las reglas en REQUIERE_REVISION. */
export function calcularPendientes(resultado: { resultados?: ReglaEvaluada[] } | null | undefined): Pendientes {
  const porClave = new Map<string, Pendiente>();
  const noEscribibles = { criterio: 0, tolerancia: 0, zona: 0, error: 0, otro: 0 };
  for (const r of resultado?.resultados ?? []) {
    if (r.resultado !== "REQUIERE_REVISION") continue;
    const { clase, claves } = clasificarMotivo(r);
    if (clase !== "escribible") {
      noEscribibles[clase] += 1;
      continue;
    }
    for (const clave of claves) {
      const p = porClave.get(clave) ?? { clave, motivo: r.motivo ?? "", reglas: [] };
      if (r.regla_id && !p.reglas.includes(r.regla_id)) p.reglas.push(r.regla_id);
      porClave.set(clave, p);
    }
  }
  const datos = [...porClave.values()].sort((a, b) => b.reglas.length - a.reglas.length || a.clave.localeCompare(b.clave));
  return { datos, noEscribibles };
}

/**
 * Mensaje corto para reanudar la sesión: solo lo que falta, con el motivo de cada dato y, si lo tiene, su criterio de decisión
 * (`criterios`: clave → definición con CRITERIO, de scripts/hechos_documentales.json y datos_universales.json). Sin el criterio,
 * los modelos más baratos repetían en la segunda pasada el mismo «no» con confianza 0.6 sin volver a mirar la lámina.
 */
export function mensajeDeSegundaPasada(p: Pendientes, max = 40, criterios?: Map<string, string>): string {
  const criterio = (clave: string) => {
    const c = criterios?.get(clave)?.split("CRITERIO: ")[1];
    return c ? ` — CRITERIO: ${c}` : "";
  };
  const lista = p.datos.slice(0, max).map((d) => `- ${d.clave} (${d.reglas.length} ${d.reglas.length === 1 ? "regla" : "reglas"}): ${d.motivo.slice(0, 140)}${criterio(d.clave)}`);
  const resto = p.datos.length > max ? `\n(y ${p.datos.length - max} más; empieza por estos)` : "";
  return [
    "Segunda pasada dirigida. El servidor volvió a evaluar el motor con lo que dejaste en lote.json y estos datos siguen pendientes:",
    ...lista,
    resto,
    "",
    "Revisa SOLO estos datos, mirando las láminas del plano:",
    "- Escribe cada uno en lote.json (con fuente y detalle). Un sí/no va como true o false, y un número con su unidad y su rango.",
    "- Amplía la lámina pertinente a 150 ppp o más antes de decidir cada dato. Si el dato trae CRITERIO, aplícalo: con la zona legible, escribe sí o no con confianza 0.85 o más aunque el resultado te parezca discutible. Usa confianza 0.6 o menos solo si la zona es ilegible y dilo en el detalle: es mejor un dato dudoso que uno inventado.",
    "- No toques las reglas de criterio ni las de zona por confirmar: no se arreglan con datos.",
    "- Cuando termines, vuelve a evaluar con precheck.planos.revisar sobre esta misma carpeta y actualiza dictamen.json solo si algo cambió.",
  ].join("\n");
}
