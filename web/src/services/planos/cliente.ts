import type { LectorOcr } from "@/lib/lector-ocr";
import { ApiError } from "@/services/api/contract";
import type { PlanExtraction } from "@/types";

/** Estado de un plano en el servidor (rutas /api/planos). */
export interface EstadoPlanoServidor {
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  fileName: string;
  sizeBytes?: number;
  error?: string;
  extraccion?: PlanExtraction | null;
}

export interface PlanoDeEjemplo {
  nombre: string;
  sizeBytes: number;
}

const FALLO_RED = "No se pudo enviar el archivo. Revise la conexión e inténtelo de nuevo.";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(body?.code ?? "plano.error", body?.message ?? "No se pudo completar la operación con el plano.");
  return body as T;
}

/**
 * Sube el archivo real a /api/planos. Con XMLHttpRequest (fetch no informa el avance de la subida): onProgress
 * recibe 0–100. El servidor responde 202 y lee el plano en segundo plano.
 */
export function subirPlano(file: File, onProgress?: (percent: number) => void, ocr?: LectorOcr, complementario?: boolean): Promise<EstadoPlanoServidor> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/planos");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: (EstadoPlanoServidor & { code?: string; message?: string }) | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        onProgress?.(100);
        resolve(body);
      } else {
        reject(new ApiError(body?.code ?? "plano.error", body?.message ?? "No se pudo cargar el plano."));
      }
    };
    xhr.onerror = () => reject(new ApiError("plano.red", FALLO_RED));
    const fd = new FormData();
    fd.set("file", file);
    if (ocr) fd.set("ocr", ocr);
    if (complementario) fd.set("rol", "complementario");
    xhr.send(fd);
  });
}

export const estadoDelPlano = async (id: string) => json<EstadoPlanoServidor>(await fetch(`/api/planos/${encodeURIComponent(id)}`));

export const miniaturaUrl = (id: string, pagina: number) => `/api/planos/${encodeURIComponent(id)}/paginas/${pagina}`;

export const ejemplosDePlanos = async () => (await json<{ items: PlanoDeEjemplo[] }>(await fetch("/api/planos/ejemplos"))).items;

export const usarEjemplo = async (nombre: string, ocr?: LectorOcr) =>
  json<EstadoPlanoServidor>(await fetch("/api/planos/ejemplos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombre, ocr }) }));

/** Un valor corrige (o agrega) el dato; `{ confirmar: true }` lo confirma tal como se leyó; null deshace lo uno o lo otro. */
export type CambioDato = string | number | null | { confirmar: true };

/** Corrige, agrega o confirma datos leídos del plano. Devuelve el plano con la lectura ya corregida. */
export async function corregirDatos(id: string, cambios: Record<string, CambioDato>): Promise<EstadoPlanoServidor> {
  await json<unknown>(
    await fetch(`/api/planos/${encodeURIComponent(id)}/hechos`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cambios) }),
  );
  return estadoDelPlano(id);
}

export interface AvisoDato {
  campo: "zona" | "finca" | "area_m2" | "corregimiento";
  nivel: "aviso" | "error";
  mensaje: string;
  sugerencia?: string;
  alternativas?: string[];
  /** La zona existe tal como está escrita, pero en otra norma (p. ej. «R2-A» en El Carmen): se sugiere cambiar la norma. */
  norma_sugerida?: string;
  normas_sugeridas?: string[];
}

export interface DatosAValidar {
  zona?: string;
  norma?: string;
  finca?: string;
  area_m2?: number;
  corregimiento?: string;
}

/** Validación corta de lo que escribió o confirmó el usuario (sin IA ni cuota): zona que no existe en la norma, finca, área… */
export async function validarDatosUsuario(datos: DatosAValidar): Promise<AvisoDato[]> {
  const res = await fetch("/api/validar-datos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datos) });
  return (await json<{ avisos: AvisoDato[] }>(res)).avisos;
}

export interface DisponibilidadOcr {
  disponible: boolean;
  motivo?: string;
}

/** Qué lectores OCR funcionan en el servidor y, de los que no, qué falta instalar o conectar. */
export async function disponibilidadOcr(): Promise<Record<LectorOcr, DisponibilidadOcr>> {
  return json(await fetch("/api/planos/ocr", { cache: "no-store" }));
}
