import { listarExpedientes } from "@/server/expedientes/almacen";
import { sinSesion } from "@/server/planos/respuestas";

/**
 * Expedientes reales revisados por el agente revisor-planos (carpeta PRECHECK_EXPEDIENTES), como proyectos.
 * La lista no lleva los resultados por regla: están en GET /api/expedientes/[id].
 */
export async function GET(request: Request) {
  // El proxy ya exige la sesión en /api/*; se verifica también aquí porque la respuesta tiene datos reales.
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const items = (await listarExpedientes()).map((e) => e.project);
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
