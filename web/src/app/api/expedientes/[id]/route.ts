import { buscarExpediente } from "@/server/expedientes/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

/** Un expediente real: el proyecto y su PreCheck (resultados, reglas tal como se evaluaron e informe del revisor). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  const expediente = await buscarExpediente(id);
  if (!expediente) return error(404, "expediente.inexistente", "El expediente no existe.");
  return Response.json(expediente, { headers: { "Cache-Control": "private, no-store" } });
}
