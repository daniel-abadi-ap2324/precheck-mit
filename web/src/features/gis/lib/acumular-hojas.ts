/** Máximo de hojas de zonificación que se conservan cargadas en la capa. */
export const ZONING_KEEP_SHEETS = 12;

/**
 * Agrega a las hojas ya cargadas las que pide la vista actual, sin sacar las anteriores: así, al mover el mapa,
 * la capa no se vacía ni se redibuja salvo cuando llega una hoja nueva. Si hay que descartar, se van primero
 * las más antiguas. Devuelve la misma referencia cuando no hay cambios.
 */
export function acumularHojas(prev: string[], requested: string[], max = ZONING_KEEP_SHEETS): string[] {
  const nuevas = requested.filter((h) => !prev.includes(h));
  if (nuevas.length === 0) return prev;
  const todas = [...prev, ...nuevas];
  return todas.slice(Math.max(0, todas.length - max));
}
