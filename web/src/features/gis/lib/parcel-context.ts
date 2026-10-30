import { formatNumber } from "@/lib/format";

/** Distancia a un cuerpo de agua bajo la cual se pide verificar la servidumbre fluvial (skill mupa-gis-zonificacion). */
export const RIVER_REVIEW_M = 50;

/** «Río a 32 m: verificar servidumbre fluvial…» si el río está a 50 m o menos; null si no aplica. Es una marca de revisión, nunca un NO_CUMPLE. */
export function riverWarning(distanceM: number | null | undefined): string | null {
  if (distanceM === null || distanceM === undefined || distanceM > RIVER_REVIEW_M) return null;
  return `Río a ${formatNumber(Math.round(distanceM))} m: verificar servidumbre fluvial con el MOP (Acuerdo 110, Art. 21.10)`;
}

/** Distancia legible: «850 m» o «1.2 km». */
export function formatDistance(m: number): string {
  return m < 1000 ? `${formatNumber(Math.round(m))} m` : `${formatNumber(Math.round(m / 100) / 10)} km`;
}
