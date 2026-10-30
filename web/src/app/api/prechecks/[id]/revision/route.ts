import { esIdPreCheck, leerEstadoPreCheck } from "@/server/prechecks/almacen";
import { ErrorRevision, escribirRevision, leerRevision, validarCambios } from "@/server/prechecks/revision";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };
const noEncontrado = () => error(404, "precheck.inexistente", "El PreCheck no existe.");
const danada = (e: ErrorRevision) => error(500, "revision.danada", `${e.message} No se sobrescribe: avise al administrador.`);

/** Revisión DOYC del PreCheck: qué decisiones de la IA confirmó o contradijo el revisor (vacía si aún no hay). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  // El id estricto (pck-<uuid>) impide salir de la carpeta de PreCheck con «..» o separadores.
  if (!esIdPreCheck(id)) return noEncontrado();
  if (!(await leerEstadoPreCheck(id).catch(() => null))) return noEncontrado();
  try {
    return Response.json(await leerRevision(id), { headers: sinCache });
  } catch (e) {
    if (e instanceof ErrorRevision) return danada(e);
    throw e;
  }
}

/**
 * Guarda la respuesta del revisor a una o varias reglas: { decisiones: { "<regla_id>": { accion, nota? } } }. Se
 * fusiona con lo guardado (las demás reglas no cambian) y la fecha la pone el servidor. Devuelve la revisión completa.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return noEncontrado();
  if (!(await leerEstadoPreCheck(id).catch(() => null))) return noEncontrado();
  const validado = validarCambios(await request.json().catch(() => null));
  if ("mensaje" in validado) return error(400, "revision.invalida", validado.mensaje);
  try {
    return Response.json(await escribirRevision(id, validado.cambios), { headers: sinCache });
  } catch (e) {
    if (e instanceof ErrorRevision) return danada(e);
    throw e;
  }
}
