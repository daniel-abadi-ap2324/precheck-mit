import { sinSesion } from "@/server/planos/respuestas";
import { leerRondas } from "@/server/rondas/datos";

/**
 * Rondas de mejora del pipeline: el catálogo curado (docs/demo/rondas.json) unido por ronda con las métricas de sus
 * corridas (web/.data/rondas-metricas.json). Un archivo que falta o no se entiende se informa en `faltantes` y
 * `avisos`, nunca con un 500.
 */
export async function GET(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  return Response.json(await leerRondas(), { headers: { "Cache-Control": "private, no-store" } });
}
