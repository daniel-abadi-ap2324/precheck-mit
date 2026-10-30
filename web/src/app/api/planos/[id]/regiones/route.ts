import { leerEstado } from "@/server/planos/almacen";
import { ErrorPropuestaEnCurso, ErrorRegiones, ErrorSinRegiones, estadoPropuesta, guardarRegiones, leerRegiones, modeloVision, proponiendo } from "@/server/planos/regiones";
import { error, idValido, noEncontrado, sinSesion } from "@/server/planos/respuestas";

/** 500 regiones × 200 vértices caben de sobra. */
const TOPE_BYTES = 4 * 1024 * 1024;
const SIN_CACHE = { "Cache-Control": "private, no-store" };

/**
 * Regiones del plano (paso 2), estado de su propuesta y el modelo con que se propondría con visión. Mientras Python
 * propone, el archivo puede estar a medio escribir: se responde sin regiones en lugar de un error.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return noEncontrado();
  if (!(await leerEstado(id).catch(() => null))) return noEncontrado();
  const [propuesta, vision] = await Promise.all([estadoPropuesta(id), modeloVision()]);
  let regiones = null;
  let aviso: string | undefined;
  try {
    regiones = await leerRegiones(id);
  } catch (e) {
    if (!proponiendo(id)) aviso = e instanceof Error ? `Las regiones guardadas no son válidas: ${e.message}` : "Las regiones guardadas no son válidas.";
  }
  return Response.json({ id, propuesta, regiones, modeloVision: vision, ...(aviso ? { aviso } : {}) }, { headers: SIN_CACHE });
}

/** Guarda las regiones editadas: `{ "regiones": [{ id, pagina, tipo, puntos, etiqueta?, confirmada? }] }` (la lista completa). */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const { id } = await ctx.params;
  if (!idValido(id)) return noEncontrado();
  if (!(await leerEstado(id).catch(() => null))) return noEncontrado();
  const texto = await request.text();
  if (texto.length > TOPE_BYTES) return error(413, "regiones.grandes", "Las regiones son demasiado grandes.");
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return error(400, "regiones.invalidas", "El cuerpo debe ser un objeto JSON.");
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return error(400, "regiones.invalidas", "El cuerpo debe ser un objeto JSON.");
  try {
    const regiones = await guardarRegiones(id, (cuerpo as { regiones?: unknown }).regiones);
    return Response.json({ id, regiones }, { headers: SIN_CACHE });
  } catch (e) {
    if (e instanceof ErrorPropuestaEnCurso) return error(409, "regiones.en_curso", e.message);
    if (e instanceof ErrorSinRegiones) return error(409, "regiones.sin_regiones", e.message);
    if (e instanceof ErrorRegiones) return error(400, "regiones.invalidas", e.message);
    throw e;
  }
}
