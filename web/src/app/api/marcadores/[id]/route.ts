import { borrarMarcador, editarMarcador, ErrorMarcadores, esIdMarcador, validarCambios } from "@/server/marcadores/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };
const noEncontrado = () => error(404, "marcador.inexistente", "El marcador no existe.");
const danado = (e: ErrorMarcadores) => error(500, "marcadores.danado", `${e.message} No se sobrescribe: avise al administrador.`);

/** Cambia el tipo o la nota de un marcador: { tipo?, nota? }. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdMarcador(id)) return noEncontrado();
  const validado = validarCambios(await request.json().catch(() => null));
  if ("mensaje" in validado) return error(400, "marcador.invalido", validado.mensaje);
  try {
    const m = await editarMarcador(id, validado.cambios);
    return m ? Response.json(m, { headers: sinCache }) : noEncontrado();
  } catch (e) {
    if (e instanceof ErrorMarcadores) return danado(e);
    throw e;
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdMarcador(id)) return noEncontrado();
  try {
    return (await borrarMarcador(id)) ? new Response(null, { status: 204 }) : noEncontrado();
  } catch (e) {
    if (e instanceof ErrorMarcadores) return danado(e);
    throw e;
  }
}
