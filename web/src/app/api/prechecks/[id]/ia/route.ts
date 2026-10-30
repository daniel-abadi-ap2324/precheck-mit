import { cancelarRevisionIa, encolarRevisionIa, ErrorIa, ErrorModeloIa, estadoIaVigente } from "@/server/ia/revisar";
import { leerPedidoXtra } from "@/server/ia/xtra";
import { esIdPreCheck, leerEstadoPreCheck } from "@/server/prechecks/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };
const noEncontrado = () => error(404, "precheck.inexistente", "El PreCheck no existe.");

/** Estado de la revisión con IA de un PreCheck (null si no se pidió). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return noEncontrado();
  if (!(await leerEstadoPreCheck(id).catch(() => null))) return noEncontrado();
  return Response.json({ ia: await estadoIaVigente(id) }, { headers: sinCache });
}

/**
 * Pide la revisión con IA. El proveedor sale del modelo pedido (DeepSeek para deepseek-flash, Claude Code o la API para
 * los Claude; sin modelo, el de Configuración). Envía el contenido del PreCheck al proveedor (Anthropic con
 * Claude Code o la API, o DeepSeek): solo ocurre cuando la persona pulsa el botón en la web, nunca de forma automática.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return noEncontrado();
  if (!(await leerEstadoPreCheck(id).catch(() => null))) return noEncontrado();
  // Cuerpo opcional: { modelo } para esta revisión (si no viene, el de Configuración) y { xtra: { empleados, modeloEmpleados } }
  // para la revisión XTRA (el modelo es el del agente maestro).
  const cuerpo = (await request.json().catch(() => null)) as { modelo?: unknown; xtra?: unknown } | null;
  const xtra = cuerpo?.xtra === undefined ? undefined : leerPedidoXtra(cuerpo.xtra);
  if (xtra === null) return error(400, "ia.xtra_invalida", "La revisión XTRA lleva de 1 a 10 empleados y el modelo de los empleados.");
  const modelo = cuerpo?.modelo;
  if (modelo !== undefined && typeof modelo !== "string") return error(400, "ia.modelo_invalido", "Modelo no válido.");
  try {
    const estado = await encolarRevisionIa(id, modelo, xtra);
    return Response.json({ ia: estado.ia ?? null }, { status: 202, headers: sinCache });
  } catch (e) {
    if (e instanceof ErrorModeloIa) return error(400, "ia.modelo_invalido", e.message);
    if (e instanceof ErrorIa) return error(409, "ia.no_disponible", e.message);
    throw e;
  }
}

/** Cancela una revisión con IA que todavía espera turno; una que ya corre no se interrumpe (409). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return noEncontrado();
  if (!(await leerEstadoPreCheck(id).catch(() => null))) return noEncontrado();
  const estado = await cancelarRevisionIa(id);
  if (!estado) return error(409, "ia.no_cancelable", "La revisión ya está corriendo o no está en cola; no se puede cancelar.");
  return Response.json({ ia: estado.ia ?? null }, { headers: sinCache });
}
