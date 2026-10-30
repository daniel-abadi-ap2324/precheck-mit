import { crearPreCheck, validarDatos } from "@/server/prechecks/almacen";
import { encolarPreCheck, planPrincipal } from "@/server/prechecks/motor";
import { datosSinConfirmar, mensajeSinConfirmar } from "@/lib/barrera-precheck";
import { esIdValido, leerEstado } from "@/server/planos/almacen";
import { actualizarProyecto, esIdProyectoWeb } from "@/server/proyectos/almacen";
import { error, sinSesion } from "@/server/planos/respuestas";

const MAX_PLANOS = 20;

/**
 * Inicia un PreCheck con el motor real sobre los planos ya leídos (con las correcciones del usuario).
 * Cuerpo: { projectId, planIds[], datos: { nombreProyecto, tramite, fechaPresentacion, normaAplicable, codigoZona?,
 * declaraciones?, datosDeclarados? } }. No se ejecuta (409) si la persona no confirmó o corrigió la finca, el área y la
 * zona del plano que va a evaluar el motor (la zona también vale si indicó el código de zona).
 */
export async function POST(request: Request) {
  const denegado = sinSesion(request);
  if (denegado) return denegado;
  const cuerpo = (await request.json().catch(() => null)) as { projectId?: unknown; planIds?: unknown; datos?: unknown } | null;
  const projectId = typeof cuerpo?.projectId === "string" ? cuerpo.projectId.slice(0, 80) : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(projectId)) return error(400, "precheck.proyecto_invalido", "Falta el proyecto.");
  const planIds = Array.isArray(cuerpo?.planIds) ? cuerpo.planIds.filter((p): p is string => typeof p === "string" && esIdValido(p)).slice(0, MAX_PLANOS) : [];
  if (!planIds.length) return error(400, "precheck.sin_planos", "Cargue al menos un plano PDF y espere a que termine su lectura.");
  const v = validarDatos(cuerpo?.datos);
  if ("mensaje" in v) return error(400, "precheck.datos_invalidos", v.mensaje);
  // El motor necesita un plano ya leído: se dice por qué no se puede todavía (leyendo, falló o no existe).
  const estados = await Promise.all(planIds.map((p) => leerEstado(p).catch(() => null)));
  if (!estados.some((e) => e?.status === "ready")) {
    if (estados.some((e) => e?.status === "queued" || e?.status === "processing")) {
      return error(409, "precheck.planos_leyendo", "El plano todavía se está leyendo. Espere a que termine (los escaneados pueden tardar varios minutos).");
    }
    if (estados.some((e) => e?.status === "failed")) return error(409, "precheck.planos_fallidos", "No se pudo leer ningún plano. Cargue otro PDF.");
    return error(400, "precheck.sin_planos", "Cargue al menos un plano PDF y espere a que termine su lectura.");
  }
  const principal = await planPrincipal(planIds);
  // El área definida por el arquitecto en las variables definidas vale como confirmada.
  const areaDefinida = v.datos.definidas?.includes("lote.area_m2") ? v.datos.datosDeclarados?.["lote.area_m2"] : undefined;
  const hechos =
    principal && areaDefinida !== undefined
      ? [...principal.extraccion.hechos.filter((h) => h.hecho !== "lote.area_m2"), { hecho: "lote.area_m2", valor: areaDefinida, confianza: 1, estado: "ok" as const, fuente: null, confirmado: true }]
      : principal?.extraccion.hechos;
  const faltan = hechos ? datosSinConfirmar(hechos, v.datos.codigoZona) : [];
  if (faltan.length) return error(409, "precheck.datos_sin_confirmar", mensajeSinConfirmar(faltan));
  const id = await crearPreCheck(projectId, planIds, v.datos);
  if (esIdProyectoWeb(projectId)) await actualizarProyecto(projectId, { status: "PROCESSING", precheckId: id });
  encolarPreCheck(id);
  return Response.json({ precheckId: id }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
