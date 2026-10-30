import { ApiError } from "@/services/api/contract";
import type { PreCheck, Project } from "@/types";

/** Cliente de las rutas /api/expedientes (expedientes reales revisados por el agente revisor-planos). */
export interface ExpedienteDetalle {
  project: Project;
  precheck: PreCheck;
}

export const esIdDeExpediente = (id: string) => id.startsWith("exp-");
export const esPrecheckDeExpediente = (id: string) => id.startsWith("pc-exp-");
/** Las láminas de un PreCheck real (pck-…) se sirven desde su carpeta; las de un expediente, desde la suya. */
const baseDe = (id: string) => (id.startsWith("pck-") ? "/api/prechecks" : "/api/expedientes");
/** Miniatura PNG de la página n del documento del expediente (requiere sesión). */
export const paginaDeExpedienteUrl = (id: string, n: number) => `${baseDe(id)}/${encodeURIComponent(id)}/paginas/${n}`;
/** PDF original del expediente (requiere sesión; se abre en otra pestaña). */
export const documentoDeExpedienteUrl = (id: string) => `${baseDe(id)}/${encodeURIComponent(id)}/documento`;

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok || !body) throw new ApiError(body?.code ?? "expediente.error", body?.message ?? "No se pudo leer el expediente.");
  return body as T;
}

/** Proyectos de los expedientes reales. Si la ruta no responde, lista vacía: la demostración sigue funcionando. */
export async function listarExpedientes(): Promise<Project[]> {
  try {
    const { items } = await json<{ items: Project[] }>(await fetch("/api/expedientes", { cache: "no-store" }));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function detalleExpediente(id: string): Promise<ExpedienteDetalle> {
  let res: Response;
  try {
    res = await fetch(`/api/expedientes/${encodeURIComponent(id)}`, { cache: "no-store" });
  } catch {
    throw new ApiError("expediente.red", "No se pudo leer el expediente. Revise la conexión e inténtelo de nuevo.");
  }
  if (res.status === 404) throw new ApiError("proyecto.inexistente", "El proyecto no existe.", { id });
  return json<ExpedienteDetalle>(res);
}
