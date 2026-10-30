import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NUMERO_PAGINA } from "@/server/expedientes/almacen";
import { carpetaPreCheck, esIdPreCheck } from "@/server/prechecks/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

/** Miniatura de una lámina del PreCheck (PNG), detrás de la sesión. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id, n } = await ctx.params;
  if (!esIdPreCheck(id) || !NUMERO_PAGINA.test(n)) return error(404, "precheck.pagina_inexistente", "La página no existe.");
  const ruta = join(/* turbopackIgnore: true */ carpetaPreCheck(id), `p${n}.png`);
  const info = await lstat(/* turbopackIgnore: true */ ruta).catch(() => null);
  if (!info?.isFile()) return error(404, "precheck.pagina_inexistente", "La página no existe.");
  const png = await readFile(/* turbopackIgnore: true */ ruta);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
