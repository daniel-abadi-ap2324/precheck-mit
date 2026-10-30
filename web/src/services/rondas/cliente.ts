import { ApiError } from "@/services/api/contract";
import type { RespuestaRondas, ResumenRecalculo } from "./tipos";

export type * from "./tipos";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok || !body) throw new ApiError(body?.code ?? "rondas.error", body?.message ?? "No se pudieron leer las rondas.");
  return body as T;
}

/** Catálogo de rondas unido con sus métricas (GET /api/rondas). */
export const leerRondas = async () => json<RespuestaRondas>(await fetch("/api/rondas"));

/** Corre scripts/analisis/rondas.py en el servidor (hasta 5 minutos) y devuelve el resumen. */
export const recalcularMetricas = async () => json<ResumenRecalculo>(await fetch("/api/rondas/recalcular", { method: "POST" }));
