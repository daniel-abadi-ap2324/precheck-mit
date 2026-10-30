import { leerMiniatura } from "@/server/expedientes/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

/**
 * Miniatura (PNG) de la página n del documento de un expediente real. Solo sirve «p<n>.png» (n entero) de la
 * carpeta del expediente, validada contra el listado: el id y n nunca se usan como ruta.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id, n } = await ctx.params;
  const png = await leerMiniatura(id, n);
  if (!png) return error(404, "expediente.pagina_inexistente", "La página no existe.");
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
