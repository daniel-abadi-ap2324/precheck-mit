import { ApiError } from "@/services/api/contract";
import type { Parcel, PlanFormat, Project, ProjectStatus } from "@/types";

/** Proyectos creados en la web, guardados en el servidor (rutas /api/proyectos). Sobreviven a recargas y reinicios. */
export interface PlanDelProyecto {
  id: string;
  fileName: string;
  format: PlanFormat;
  sizeBytes: number;
}

export interface ProyectoServidor {
  project: Project;
  loteDibujado?: Parcel;
  planes: PlanDelProyecto[];
}

export const esProyectoWeb = (id: string) => id.startsWith("prj-web-");

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(body?.code ?? "proyecto.error", body?.message ?? "No se pudo completar la operación con el proyecto.");
  return body as T;
}

const enviar = (url: string, method: string, cuerpo: unknown) =>
  fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });

/** Lista de proyectos web; si la ruta no responde, lista vacía (la demostración sigue funcionando). */
export async function listarProyectosWeb(): Promise<ProyectoServidor[]> {
  try {
    return (await json<{ items: ProyectoServidor[] }>(await fetch("/api/proyectos"))).items;
  } catch {
    return [];
  }
}

export const leerProyectoWeb = async (id: string) => json<ProyectoServidor>(await fetch(`/api/proyectos/${encodeURIComponent(id)}`));

export const crearProyectoWeb = async (input: Omit<Project, "id" | "status" | "updatedAt">, loteDibujado?: Parcel) =>
  json<ProyectoServidor>(await enviar("/api/proyectos", "POST", { input, loteDibujado }));

export async function eliminarProyectoWeb(id: string): Promise<void> {
  const res = await fetch(`/api/proyectos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await json<unknown>(res);
}

export const actualizarProyectoWeb = async (
  id: string,
  cambios: { name?: string; status?: ProjectStatus; precheckId?: string; complianceIndex?: number; agregarPlan?: PlanDelProyecto; quitarPlan?: string },
) => json<ProyectoServidor>(await enviar(`/api/proyectos/${encodeURIComponent(id)}`, "PATCH", cambios));
