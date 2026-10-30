import { ErrorMarcadores, guardarMarcador, leerMarcadores, validarEntrada } from "@/server/marcadores/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };
const danado =(e: ErrorMarcadores) => error(500, "marcadores.danado", `${e.message} No se sobrescribe: avise al administrador.`);

/** Marcadores guardados, los más recientes primero (?projectId= para los de un proyecto). */
export async function GET(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  try {
    return Response.json({ items: await leerMarcadores({ projectId }) }, { headers: sinCache });
  } catch (e) {
    if (e instanceof ErrorMarcadores) return danado(e);
    throw e;
  }
}

/** Guarda un marcador: { projectId, precheckId, ruleId, tipo, nota?, foto }. Si ya había uno para esa regla, lo reemplaza. */
export async function POST(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const validado = validarEntrada(await request.json().catch(() => null));
  if ("mensaje" in validado) return error(400, "marcador.invalido", validado.mensaje);
  try {
    return Response.json(await guardarMarcador(validado.entrada), { status: 201, headers: sinCache });
  } catch (e) {
    if (e instanceof ErrorMarcadores) return danado(e);
    throw e;
  }
}
