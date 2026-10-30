import { CLAVE_HECHO, confirmable, esConfirmar, guardarCorrecciones, leerExtraccionOriginal, valorValido, type Cambio } from "@/server/planos/correcciones";
import { leerEstado } from "@/server/planos/almacen";
import { error, idValido, noEncontrado, sinSesion } from "@/server/planos/respuestas";

const TOPE_BYTES = 64 * 1024;

/**
 * Corrige, agrega o confirma datos de un plano ya leído:
 * `{ "lote.area_m2": 1200, "lote.finca": { "confirmar": true }, "proyecto.pisos_totales": null }`.
 * Un valor corrige (o agrega) el dato; `{ confirmar: true }` lo da por bueno tal como se leyó; null deshace lo uno o lo
 * otro. El PreCheck usa el dato con procedencia «humano» y confianza 1.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!idValido(id)) return noEncontrado();
  const estado = await leerEstado(id).catch(() => null);
  if (!estado) return noEncontrado();
  if (estado.status !== "ready") return error(409, "plano.no_listo", "El plano todavía no se terminó de leer.");
  const texto = await request.text();
  if (texto.length > TOPE_BYTES) return error(413, "plano.correcciones_grandes", "Las correcciones son demasiado grandes.");
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return error(400, "plano.correcciones_invalidas", "El cuerpo debe ser un objeto JSON.");
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return error(400, "plano.correcciones_invalidas", "El cuerpo debe ser un objeto JSON.");
  const cambios: Record<string, Cambio> = {};
  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (!CLAVE_HECHO.test(clave)) return error(400, "plano.dato_invalido", `«${clave.slice(0, 60)}» no es un dato que use el PreCheck.`);
    if (valor !== null && !valorValido(valor) && !esConfirmar(valor)) return error(400, "plano.valor_invalido", `El valor de «${clave}» no es válido.`);
    cambios[clave] = valor as Cambio;
  }
  // Solo se confirma lo que el lector leyó con un único valor; si dudó o no lo encontró, hay que corregirlo.
  const aConfirmar = Object.keys(cambios).filter((c) => esConfirmar(cambios[c]));
  if (aConfirmar.length) {
    const ext = await leerExtraccionOriginal(id);
    const noConfirmable = aConfirmar.find((c) => !confirmable(ext?.hechos.find((h) => h.hecho === c)));
    if (noConfirmable) return error(400, "plano.no_confirmable", `«${noConfirmable}» no tiene un valor leído que confirmar: corríjalo con el valor correcto.`);
  }
  try {
    const correcciones = await guardarCorrecciones(id, cambios);
    return Response.json({ id, correcciones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return error(400, "plano.correcciones_invalidas", e instanceof Error ? e.message : "No se pudieron guardar las correcciones.");
  }
}
