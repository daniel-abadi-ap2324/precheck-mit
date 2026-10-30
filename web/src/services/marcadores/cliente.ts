import { ApiError } from "@/services/api/contract";
import type { CambiosMarcador, EntradaMarcador, Marcador } from "./tipos";

export type * from "./tipos";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok || !body) throw new ApiError(body?.code ?? "marcadores.error", body?.message ?? "No se pudieron leer los marcadores.");
  return body as T;
}

const JSON_CUERPO = { "content-type": "application/json" };

/** Marcadores guardados, los más recientes primero; con `projectId`, solo los de ese proyecto. */
export const leerMarcadores = async (projectId?: string) =>
  (await json<{ items: Marcador[] }>(await fetch(`/api/marcadores${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { cache: "no-store" }))).items;

export const guardarMarcador = async (entrada: EntradaMarcador) =>
  json<Marcador>(await fetch("/api/marcadores", { method: "POST", headers: JSON_CUERPO, body: JSON.stringify(entrada) }));

export const editarMarcador = async (id: string, cambios: CambiosMarcador) =>
  json<Marcador>(await fetch(`/api/marcadores/${encodeURIComponent(id)}`, { method: "PATCH", headers: JSON_CUERPO, body: JSON.stringify(cambios) }));

export async function borrarMarcador(id: string): Promise<void> {
  const res = await fetch(`/api/marcadores/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await json(res);
}
