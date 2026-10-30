import { ApiError } from "@/services/api/contract";
import type { RegionPlano, RegionesPlano } from "@/types";

/** Estado de la propuesta automática de regiones (Python en segundo plano). */
export interface PropuestaRegiones {
  status: "idle" | "processing" | "ready" | "failed";
  vision?: boolean;
  /** Modelo que propone (o propuso) con visión (id de la configuración de IA). */
  modelo?: string;
  error?: string;
}

export interface RegionesServidor {
  id: string;
  propuesta: PropuestaRegiones;
  regiones: RegionesPlano | null;
  /** Modelo con que se propondría con visión ahora: el de la configuración de IA. */
  modeloVision?: { id: string; nombre: string };
  aviso?: string;
}

/** Lo que el editor manda al guardar: el servidor decide origen, «editada» y confianza. */
export type RegionEditada = Pick<RegionPlano, "id" | "pagina" | "tipo" | "puntos" | "etiqueta" | "confirmada">;

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(body?.code ?? "regiones.error", body?.message ?? "No se pudo completar la operación con las regiones.");
  return body as T;
}

const base = (id: string) => `/api/planos/${encodeURIComponent(id)}/regiones`;

export const leerRegionesPlano = async (id: string) => json<RegionesServidor>(await fetch(base(id)));

export async function guardarRegionesPlano(id: string, regiones: RegionEditada[]): Promise<RegionesPlano> {
  const body = JSON.stringify({ regiones: regiones.map(({ id, pagina, tipo, puntos, etiqueta, confirmada }) => ({ id, pagina, tipo, puntos, etiqueta, confirmada })) });
  return (await json<{ regiones: RegionesPlano }>(await fetch(base(id), { method: "PUT", headers: { "content-type": "application/json" }, body }))).regiones;
}

export const proponerRegionesPlano = async (id: string, vision: boolean) =>
  json<{ propuesta: PropuestaRegiones }>(await fetch(`${base(id)}/proponer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vision }) }));

/** Raster de la página n. `v` cambia la URL tras una propuesta nueva (la imagen se reescribe con el mismo nombre). */
export const imagenRegionesUrl = (id: string, n: number, v?: string) => `${base(id)}/imagen/${n}${v ? `?v=${encodeURIComponent(v)}` : ""}`;
