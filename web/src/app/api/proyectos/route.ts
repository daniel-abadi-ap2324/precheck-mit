import { crearProyecto, listarProyectos, validarEntrada, validarLoteDibujado } from "@/server/proyectos/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };

/** Proyectos creados en la web (los de demostración y los expedientes tienen sus propias fuentes). */
export async function GET(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  return Response.json({ items: await listarProyectos() }, { headers: sinCache });
}

/** Crea un proyecto desde el asistente. Cuerpo: { input: ProjectInput, loteDibujado?: Parcel (lote dibujado) }. */
export async function POST(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const cuerpo = (await request.json().catch(() => null)) as { input?: unknown; loteDibujado?: unknown } | null;
  const entrada = validarEntrada(cuerpo?.input);
  if (!entrada) return error(400, "proyecto.datos_invalidos", "Faltan los datos del proyecto (nombre de al menos 3 caracteres).");
  const creado = await crearProyecto(entrada, validarLoteDibujado(cuerpo?.loteDibujado));
  return Response.json(creado, { status: 201, headers: sinCache });
}
