import type { ZonePolygon, Zoning } from "@/types";

/**
 * Qué norma se puede mostrar para un polígono del Documento Gráfico:
 * - `ficha`: código de suelo urbano (prefijo 1) con ficha del Anexo 4 cargada.
 * - `ficha_no_cargada`: código del PLOT cuya ficha no está en los datos de la demostración.
 * - `anexo5`: suelo urbanizable o de protección (matriz del Anexo 5, no cargada).
 * - `miviot`: norma anterior del MIVIOT que el PLOT mantiene; no hay ficha del PLOT.
 * - `revision`: polígono sin código único (sin_etiqueta / conflicto); nunca alimenta reglas.
 */
export type ZoneNorm =
  | { kind: "ficha"; zoning: Zoning }
  | { kind: "ficha_no_cargada"; code: string }
  | { kind: "anexo5"; code: string }
  | { kind: "miviot"; code: string }
  | { kind: "revision" };

/** «RM1» (rótulo de la hoja) y «RM-1» (ficha) son el mismo código del PLOT. */
const normalize = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");

export function zoneNorm(zone: ZonePolygon, zonings: Zoning[]): ZoneNorm {
  if (zone.estado !== "ok" || !zone.codigo_ficha) return { kind: "revision" };
  const code = zone.codigo_ficha;
  // Un RM1 del MIVIOT no es el RM-1 del PLOT: nunca se busca ficha para esta familia.
  if (zone.familia === "miviot") return { kind: "miviot", code };
  if (zone.familia === "proteccion" || zone.familia === "urbanizable") return { kind: "anexo5", code };
  const zoning = zonings.find((z) => normalize(z.code) === normalize(code));
  return zoning ? { kind: "ficha", zoning } : { kind: "ficha_no_cargada", code };
}

/** Rótulo doble «uso actual / uso futuro» (p. ej. «1P / 1ZM6»). */
export const isDualLabel = (zone: ZonePolygon) => Boolean(zone.codigo?.includes("/"));
