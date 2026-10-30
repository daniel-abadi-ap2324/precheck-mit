import { ApiError } from "@/services/api/contract";

/** Revisión con IA (rutas /api/ia y /api/prechecks/[id]/ia). La llave de la API nunca vuelve al navegador. */
export type ProveedorIa = "ninguno" | "claude-code" | "anthropic-api" | "deepseek-api";

export interface ConfigIa {
  proveedor: ProveedorIa;
  modelo: string;
  /** Solo los modelos del proveedor elegido (el servidor filtra). */
  modelos: { id: string; nombre: string }[];
  /** Modelo para planos escaneados; null = el mismo de la revisión. */
  modeloEscaneados: string | null;
  /** Todos los modelos (el de escaneados corre con el proveedor que lo sirva). */
  modelosEscaneados: { id: string; nombre: string }[];
  /** Llave de la API de Anthropic. */
  llaveConfigurada: boolean;
  origenLlave: "web" | "entorno" | null;
  claudeCodeDisponible: boolean;
  /** DeepSeek: si hay llave en el servidor (nunca su valor) y el gasto acumulado frente al tope. */
  deepseek: { llave: boolean; gastoUsd: number; topeUsd: number; llamadas: number };
}

export interface EstadoIa {
  status: "running" | "done" | "failed";
  proveedor: Exclude<ProveedorIa, "ninguno">;
  modelo: string;
  error?: string;
  actualizadoEn: string;
  /** La revisión terminó pero pudo ser superficial (muy corta o con muy pocos hallazgos). */
  aviso?: string;
  /** Pedida pero sin turno todavía: hay un máximo de revisiones a la vez. */
  enEspera?: boolean;
  /** Última línea escrita en el registro (ISO); null si aún no hay. */
  ultimaActividad?: string | null;
  /** Segundos desde esa última actividad, medidos por el servidor (el reloj del navegador no interviene). */
  segundosSinActividad?: number | null;
  revisionesCorriendo?: number;
  revisionesEsperando?: number;
  maxParalelo?: number;
  /** Revisión XTRA: un agente maestro revisa lo que dijeron varios agentes empleados. */
  xtra?: EstadoXtra;
  /** Corrió con otro modelo del pedido (política de escaneados): el motivo y el modelo que se pidió. */
  enrutado?: string;
  modeloPedido?: string;
}

export interface EstadoXtra {
  empleados: number;
  modeloEmpleados: string;
  fase: "empleados" | "maestro";
  terminados: number;
  fallidos: number;
}

/** Pedido de revisión XTRA: cuántos empleados (1 a 10) y con qué modelo; el modelo de la revisión es el del maestro. */
export interface PedidoXtra {
  empleados: number;
  modeloEmpleados: string;
}

export const MAX_EMPLEADOS_XTRA = 10;

/** Título de la revisión: «Revisión XTRA» cuando lo es, para no confundirla con las corridas de prueba. */
export const tituloRevisionIa = (ia?: Pick<EstadoIa, "xtra"> | null) =>
  ia?.xtra ? `Revisión XTRA (1 maestro + ${ia.xtra.empleados} ${ia.xtra.empleados === 1 ? "empleado" : "empleados"})` : "Revisión con IA (PreCheck IA)";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(body?.code ?? "ia.error", body?.message ?? "No se pudo completar la operación con la IA.");
  return body as T;
}

const enviar = (url: string, method: string, cuerpo?: unknown) =>
  fetch(url, { method, headers: { "content-type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

export const leerConfigIa = async () => json<ConfigIa>(await fetch("/api/ia"));

/** `llave: null` borra la llave guardada. */
export const guardarConfigIa = async (cambios: { proveedor?: ProveedorIa; modelo?: string; modeloEscaneados?: string | null; llave?: string | null }) => json<ConfigIa>(await enviar("/api/ia", "PUT", cambios));

export const estadoRevisionIa = async (precheckId: string) =>
  (await json<{ ia: EstadoIa | null }>(await fetch(`/api/prechecks/${encodeURIComponent(precheckId)}/ia`))).ia;

/** `modelo`: el de esta revisión (en la XTRA, el del maestro); sin él, el de Configuración. */
export const pedirRevisionIa = async (precheckId: string, modelo?: string, xtra?: PedidoXtra) => {
  const cuerpo = modelo || xtra ? { ...(modelo ? { modelo } : {}), ...(xtra ? { xtra } : {}) } : undefined;
  return (await json<{ ia: EstadoIa | null }>(await enviar(`/api/prechecks/${encodeURIComponent(precheckId)}/ia`, "POST", cuerpo))).ia;
};

export const urlRegistroIa = (precheckId: string, formato: "txt" | "jsonl", descargar = false) =>
  `/api/prechecks/${encodeURIComponent(precheckId)}/ia/registro?formato=${formato}${descargar ? "&descargar=1" : ""}`;

/** Registro legible de la revisión; null si todavía no hay. */
export async function leerRegistroIa(precheckId: string): Promise<string | null> {
  const res = await fetch(urlRegistroIa(precheckId, "txt"), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError("ia.error", "No se pudo leer el registro.");
  return res.text();
}
