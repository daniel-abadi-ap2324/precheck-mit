import { ApiError } from "@/services/api/contract";
import type { AccionRevision, PreCheck, PreCheckProgress, Project, RevisionPreCheck } from "@/types";

/** Lo que el usuario confirma antes de correr el motor real (rutas /api/prechecks). */
export interface DatosMotor {
  nombreProyecto: string;
  tramite: string;
  /** AAAA-MM-DD */
  fechaPresentacion: string;
  /** Código de precheck/reglas/normas.json, p. ej. PLOT-A61-2021. */
  normaAplicable: string;
  codigoZona?: string;
  /** Declaraciones sí/no opcionales del expediente (Acuerdo 110, Anexos III y IV; decisión D9). */
  declaraciones?: {
    esUrbanizacionOParcelacion?: boolean;
    servidumbreOtraEntidad?: boolean;
    servidumbreFluvialOPluvial?: boolean;
    requiereBcbrp?: boolean;
  };
  /** Cuadro de datos del anteproyecto: números declarados por ruta del hecho (lib/datos-declarados). */
  datosDeclarados?: Record<string, number>;
  /** Claves que el arquitecto definió al 100 % (variables definidas). */
  definidas?: string[];
}

export interface EstadoIaServidor {
  status: "running" | "done" | "failed";
  proveedor: "claude-code" | "anthropic-api";
  modelo: string;
  error?: string;
  actualizadoEn: string;
  /** «Revisión posiblemente superficial»: muy pocos hallazgos propios. */
  aviso?: string;
}

export interface PreCheckServidor {
  /** Estado guardado en el servidor: con qué datos se ejecutó el motor. */
  estado: { status: "queued" | "running" | "done" | "failed"; datos: DatosMotor; createdAt: string; updatedAt: string };
  project: Project;
  precheck: PreCheck;
  avisos: string[];
  ia: EstadoIaServidor | null;
  /** Datos que piden las reglas que aplican a este plano (claves como «proyecto.altura_m»). */
  datosPedidos?: string[];
}

/** El motor real corre sobre estos ids (pck-…); los demás son de demostración o de expedientes. */
export const esPreCheckReal = (id: string) => id.startsWith("pck-");

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
  if (!res.ok) throw new ApiError(body?.code ?? "precheck.error", body?.message ?? "No se pudo completar la operación con el PreCheck.");
  return body as T;
}

export async function iniciarPreCheckReal(projectId: string, planIds: string[], datos: DatosMotor): Promise<string> {
  const res = await fetch("/api/prechecks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, planIds, datos }) });
  return (await json<{ precheckId: string }>(res)).precheckId;
}

export const progresoReal = async (id: string) => json<PreCheckProgress>(await fetch(`/api/prechecks/${encodeURIComponent(id)}/progreso`));

export const leerPreCheckServidor = async (id: string) => json<PreCheckServidor>(await fetch(`/api/prechecks/${encodeURIComponent(id)}`));

/** Lo que la app ya trata como fresco (staleTime global de React Query). */
const RECIENTE_MS = 30_000;
const recientes = new Map<string, { promesa: Promise<PreCheckServidor>; desde: number }>();

/**
 * Como leerPreCheckServidor, pero reutiliza la misma lectura (en curso o de hace menos de `maxEdadMs`). GET
 * /api/prechecks/[id] es caro (traduce el resultado y lee el catálogo de reglas) y la página de planos lo pedía dos
 * veces seguidas: al leer el proyecto (getProject) y al precargar «Volver a ejecutar». No sirve para sondear: el
 * estado de la IA usa leerPreCheckServidor. Un error no se guarda.
 */
export function leerPreCheckReciente(id: string, maxEdadMs = RECIENTE_MS): Promise<PreCheckServidor> {
  const previa = recientes.get(id);
  if (previa && Date.now() - previa.desde < maxEdadMs) return previa.promesa;
  for (const [k, v] of recientes) if (Date.now() - v.desde >= RECIENTE_MS) recientes.delete(k);
  const promesa = leerPreCheckServidor(id);
  const entrada = { promesa, desde: Date.now() };
  recientes.set(id, entrada);
  promesa.catch(() => {
    if (recientes.get(id) === entrada) recientes.delete(id);
  });
  return promesa;
}

export const miniaturaPreCheckUrl = (id: string, pagina: number) => `/api/prechecks/${encodeURIComponent(id)}/paginas/${pagina}`;

/** Revisión DOYC del PreCheck (revision.json): qué decisiones de la IA confirmó o contradijo el revisor. */
export const leerRevision = async (id: string) => json<RevisionPreCheck>(await fetch(`/api/prechecks/${encodeURIComponent(id)}/revision`));

/** Guarda la respuesta del revisor a una regla; el servidor la fusiona con las demás y devuelve la revisión completa. */
export async function guardarRevision(id: string, reglaId: string, accion: AccionRevision, nota = ""): Promise<RevisionPreCheck> {
  const res = await fetch(`/api/prechecks/${encodeURIComponent(id)}/revision`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decisiones: { [reglaId]: { accion, nota } } }),
  });
  return json<RevisionPreCheck>(res);
}
