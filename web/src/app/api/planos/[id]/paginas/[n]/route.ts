import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDe } from "@/server/planos/almacen";
import { idValido, noEncontrado } from "@/server/planos/respuestas";

/** Miniatura de la hoja n (PNG) de un plano leído. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  if (!idValido(id) || !/^[1-9]\d{0,2}$/.test(n)) return noEncontrado();
  const png = await readFile(join(carpetaDe(id), `p${n}.png`)).catch(() => null);
  if (!png) return noEncontrado();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
