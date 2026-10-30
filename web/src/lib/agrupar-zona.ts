import type { ComplianceResult, ComplianceStatus } from "@/types";

/** Grupo de las reglas de otra zona que siguen en revisión solo porque la zona del lote no está confirmada. */
export const GRUPO_ZONA = "zona_por_confirmar";

type ConResultado = { result: Pick<ComplianceResult, "group" | "status" | "dictamen"> };

/**
 * Separa las reglas de otras zonas (se muestran en una sola línea) de las que se listan en detalle. No cambia ningún
 * estado: las agrupadas siguen en «Requiere revisión» (principio 2; ADR-0012 de motor-reglas-auditable).
 *
 * Con el dictamen del arquitecto revisor, una regla agrupada que quedó NO_APLICA sale del detalle y de la línea
 * (cuenta en «No aplica»); una que el dictamen decidió de otro modo se lista en detalle; solo las que siguen en
 * revisión van en la línea. Las que solo tienen la decisión de respaldo del motor (ADR-0016: información requerida,
 * falta la CEUS o la unidad territorial) también van en la línea.
 */
export function separarPorZona<T extends ConResultado>(items: T[]): { detalle: T[]; porZona: T[] } {
  const detalle: T[] = [];
  const porZona: T[] = [];
  for (const item of items) {
    if (item.result.group !== GRUPO_ZONA) detalle.push(item);
    else if (item.result.status === "MANUAL_REVIEW" || (item.result.dictamen?.origen === "motor" && item.result.status !== "NOT_APPLICABLE")) porZona.push(item);
    else if (item.result.status !== "NOT_APPLICABLE") detalle.push(item);
  }
  return { detalle, porZona };
}

/**
 * Texto de la línea que resume las reglas agrupadas. Con `motivo` (la decisión de respaldo del motor, p. ej. «Depende
 * de la zona del lote: falta la CEUS o la unidad territorial.»), dice qué falta en vez de «Siguen en revisión».
 */
export function lineaPorZona(total: number, motivo?: string | null): string {
  const reglas = total === 1 ? "regla" : "reglas";
  const m = motivo?.trim().replace(/\.$/, "");
  if (m) return `${total} ${reglas} de otras zonas de la norma: ${m.charAt(0).toLowerCase()}${m.slice(1)} (información requerida).`;
  return `${total} ${reglas} de otras zonas de la norma: dependen de confirmar el código de zona (CEUS). Siguen en «Requiere revisión».`;
}

/** Texto y estado de la línea de las agrupadas: «Requiere revisión», o el de la decisión de respaldo del motor si la hay. */
export function resumenPorZona(porZona: ConResultado[]): { texto: string; status: ComplianceStatus } {
  const respaldo = porZona.find((i) => i.result.dictamen?.origen === "motor");
  if (!respaldo) return { texto: lineaPorZona(porZona.length), status: "MANUAL_REVIEW" };
  return { texto: lineaPorZona(porZona.length, respaldo.result.dictamen?.justificacion), status: respaldo.result.status };
}
