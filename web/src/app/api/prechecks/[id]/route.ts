import { esIdPreCheck, leerEstadoPreCheck } from "@/server/prechecks/almacen";
import { leerPreCheckReal } from "@/server/prechecks/traducir";
import { error, sinSesion } from "@/server/planos/respuestas";
import { reanudarSiHaceFalta } from "@/server/prechecks/motor";
import { carpetaPreCheck } from "@/server/prechecks/almacen";
import { datosQuePidenLasReglas } from "@/server/ia/revisar";

const noEncontrado = () => error(404, "precheck.inexistente", "El PreCheck no existe.");

/** El PreCheck traducido para la interfaz (resultados, resumen, reglas) y el proyecto con los datos que usó el motor. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!esIdPreCheck(id)) return noEncontrado();
  await reanudarSiHaceFalta(id);
  const estado = await leerEstadoPreCheck(id).catch(() => null);
  if (!estado) return noEncontrado();
  if (estado.status === "failed") return error(422, "precheck.fallo", estado.error ?? "El PreCheck falló.");
  const real = await leerPreCheckReal(id).catch(() => null);
  if (!real) return error(409, "precheck.no_listo", "El PreCheck todavía no termina.");
  // Los datos que piden las reglas que aplican a este plano (según su norma y zona): contra eso se mide cuántos escribió cada corrida.
  const datosPedidos = (await datosQuePidenLasReglas(carpetaPreCheck(id)).catch(() => [])).map((d) => d.clave);
  return Response.json({ ...real, ia: estado.ia ?? null, datosPedidos }, { headers: { "Cache-Control": "private, no-store" } });
}
