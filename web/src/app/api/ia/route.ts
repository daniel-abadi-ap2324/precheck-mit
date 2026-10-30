import { esLlaveValida, esModelo, esModeloDe, esProveedor, estadoConfig, guardarConfig, guardarLlave, leerConfig, mensajeModeloAjeno, modeloPorDefecto, type ConfigIa } from "@/server/ia/config";
import { error, sinSesion } from "@/server/planos/respuestas";

const sinCache = { "Cache-Control": "private, no-store" };

/** Configuración de la revisión con IA. Nunca incluye la llave: solo si hay una configurada. */
export async function GET(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  return Response.json(await estadoConfig(), { headers: sinCache });
}

/**
 * Cambia proveedor y modelo, y guarda o borra la llave de la API.
 * Cuerpo: { proveedor?, modelo?, modeloEscaneados?: string | null, llave?: string | null } (llave null la borra;
 * modeloEscaneados null vuelve a usar el mismo modelo de la revisión para los escaneados).
 * El modelo tiene que ser de ese proveedor (o del actual si no se cambia): una pareja ajena responde 400. Si cambia el
 * proveedor sin decir modelo, se pasa al modelo por defecto del nuevo proveedor (con la IA apagada se conserva el que había).
 */
export async function PUT(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return error(400, "ia.config_invalida", "El cuerpo debe ser un objeto JSON.");
  const cambios: Partial<ConfigIa> = {};
  if ("proveedor" in cuerpo) {
    if (!esProveedor(cuerpo.proveedor)) return error(400, "ia.proveedor_invalido", "Proveedor no válido.");
    cambios.proveedor = cuerpo.proveedor;
  }
  if ("modelo" in cuerpo) {
    if (!esModelo(cuerpo.modelo)) return error(400, "ia.modelo_invalido", "Modelo no válido.");
    cambios.modelo = cuerpo.modelo;
  }
  if ("modeloEscaneados" in cuerpo) {
    // Cualquier modelo de la lista: si es de otro proveedor, la revisión del escaneado corre con el que lo sirva.
    if (cuerpo.modeloEscaneados !== null && !esModelo(cuerpo.modeloEscaneados)) return error(400, "ia.modelo_invalido", "Modelo para escaneados no válido.");
    cambios.modeloEscaneados = cuerpo.modeloEscaneados;
  }
  if (cambios.proveedor || cambios.modelo) {
    const actual = await leerConfig();
    const proveedor = cambios.proveedor ?? actual.proveedor;
    if (cambios.modelo && !esModeloDe(proveedor, cambios.modelo)) return error(400, "ia.modelo_ajeno", mensajeModeloAjeno(proveedor, cambios.modelo));
    if (!cambios.modelo && proveedor !== actual.proveedor && proveedor !== "ninguno") cambios.modelo = modeloPorDefecto(proveedor);
  }
  if ("llave" in cuerpo) {
    if (cuerpo.llave !== null && !esLlaveValida(cuerpo.llave)) return error(400, "ia.llave_invalida", "La llave no tiene la forma de una llave de la API de Anthropic (sk-ant-…).");
    await guardarLlave(cuerpo.llave as string | null);
  }
  if (Object.keys(cambios).length) await guardarConfig(cambios);
  return Response.json(await estadoConfig(), { headers: sinCache });
}
