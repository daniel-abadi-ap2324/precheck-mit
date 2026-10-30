import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaPreCheck, esIdPreCheck, leerEstadoPreCheck } from "@/server/prechecks/almacen";
import { progresoDe } from "@/server/prechecks/traducir";
import { error, sinSesion } from "@/server/planos/respuestas";
import { reanudarSiHaceFalta } from "@/server/prechecks/motor";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return error(404, "precheck.inexistente", "El PreCheck no existe.");
  await reanudarSiHaceFalta(id);
  const estado = await leerEstadoPreCheck(id).catch(() => null);
  if (!estado) return error(404, "precheck.inexistente", "El PreCheck no existe.");
  if (estado.status === "failed") return error(422, "precheck.fallo", estado.error ?? "El PreCheck falló.");
  let total = 0;
  if (estado.status === "done") {
    const texto = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaPreCheck(id), "resultado.json"), "utf8").catch(() => null);
    total = texto ? ((JSON.parse(texto) as { resultados?: unknown[] }).resultados?.length ?? 0) : 0;
  }
  return Response.json(progresoDe(estado, total), { headers: { "Cache-Control": "private, no-store" } });
}
