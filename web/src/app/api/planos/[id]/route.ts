import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDe } from "@/server/planos/almacen";
import { estadoVigente } from "@/server/planos/procesar";
import { aplicarCorrecciones, leerCorrecciones } from "@/server/planos/correcciones";
import { idValido, noEncontrado } from "@/server/planos/respuestas";

/** Estado de un plano y, cuando está listo, su extracción (con las correcciones del usuario) (páginas, láminas, hechos y requisitos del Anexo IV). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return noEncontrado();
  const estado = await estadoVigente(id).catch(() => null);
  if (!estado) return noEncontrado();
  const original =
    estado.status === "ready" ? JSON.parse(await readFile(join(carpetaDe(id), "extraccion.json"), "utf8").catch(() => "null")) : null;
  // Con las correcciones del usuario puestas (la extracción original no se modifica).
  const extraccion = original ? aplicarCorrecciones(original, await leerCorrecciones(id)) : null;
  return Response.json({ id, ...estado, extraccion }, { headers: { "Cache-Control": "private, no-store" } });
}
