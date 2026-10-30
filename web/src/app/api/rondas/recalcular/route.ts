import { error, sinSesion } from "@/server/planos/respuestas";
import { recalcularRondas } from "@/server/rondas/recalcular";

/** Vuelve a calcular las métricas de las rondas (scripts/analisis/rondas.py, a lo sumo 5 minutos; una a la vez). */
export async function POST(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const r = await recalcularRondas();
  if (!r.ok) return error(r.status, r.code, r.message);
  return Response.json(r.resumen, { headers: { "Cache-Control": "private, no-store" } });
}
