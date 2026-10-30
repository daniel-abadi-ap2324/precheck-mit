import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDe } from "@/server/planos/almacen";
import { idValido, noEncontrado } from "@/server/planos/respuestas";

/** Raster de la hoja n (r<N>.png) sobre el que se editan las regiones. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  if (!idValido(id) || !/^[1-9]\d{0,2}$/.test(n)) return noEncontrado();
  const png = await readFile(join(carpetaDe(id), `r${n}.png`)).catch(() => null);
  if (!png) return noEncontrado();
  // «Proponer de nuevo» reescribe la imagen con el mismo nombre. El editor pide la URL con `?v=<generado>`, que cambia
  // con cada propuesta: esa URL se puede guardar en caché (antes, sin validadores, cada visita volvía a bajar varios MB).
  // Sin `v`, sin caché larga.
  const versionada = new URL(request.url).searchParams.has("v");
  const cache = versionada ? "private, max-age=86400, immutable" : "private, no-cache";
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": cache } });
}
