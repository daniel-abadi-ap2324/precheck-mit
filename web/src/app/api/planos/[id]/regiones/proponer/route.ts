import { leerEstado } from "@/server/planos/almacen";
import { ErrorPropuestaEnCurso, proponerRegiones } from "@/server/planos/regiones";
import { error, idValido, noEncontrado, sinSesion } from "@/server/planos/respuestas";

/**
 * Propone (o vuelve a proponer) las regiones del plano en segundo plano: `{ "vision": true }` usa además el modelo de
 * visión, el de la configuración de IA (lo elige el servidor, no el cliente). Las regiones confirmadas, editadas o
 * dibujadas por la persona se conservan.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!idValido(id)) return noEncontrado();
  const estado = await leerEstado(id).catch(() => null);
  if (!estado) return noEncontrado();
  if (estado.status !== "ready") return error(409, "plano.no_listo", "El plano todavía no se terminó de leer.");
  const texto = await request.text();
  if (texto.length > 1024) return error(413, "regiones.cuerpo_grande", "El cuerpo es demasiado grande.");
  let cuerpo: unknown = {};
  if (texto.trim()) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return error(400, "regiones.cuerpo_invalido", "El cuerpo debe ser un objeto JSON.");
    }
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return error(400, "regiones.cuerpo_invalido", "El cuerpo debe ser un objeto JSON.");
  const vision = (cuerpo as { vision?: unknown }).vision;
  if (vision !== undefined && typeof vision !== "boolean") return error(400, "regiones.cuerpo_invalido", "«vision» debe ser sí/no.");
  let propuesta;
  try {
    propuesta = await proponerRegiones(id, { vision: vision === true });
  } catch (e) {
    if (e instanceof ErrorPropuestaEnCurso) return error(409, "regiones.en_curso", e.message);
    throw e;
  }
  return Response.json({ id, propuesta }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
