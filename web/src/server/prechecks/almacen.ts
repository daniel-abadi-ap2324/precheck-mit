import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validarDatosDeclarados } from "@/lib/datos-declarados";
import { esNormaConocida } from "./normas";

/**
 * PreCheck reales: una carpeta por ejecución (estado.json, lote.json, extraccion.json con las correcciones, las
 * miniaturas p<N>.png y lo que escribe el motor: hechos.json, resultado.json, resumen.md; dictamen.json si se
 * pidió la revisión con IA). Contiene datos de expedientes: queda en .data/ (fuera del repositorio) y solo se sirve
 * detrás de la sesión. PRECHECKS_DIR permite ubicarla en otro disco.
 */
export const raizPreChecks = () =>
  resolve(/* turbopackIgnore: true */ process.env.PRECHECKS_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "prechecks"));

const ID = /^pck-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const nuevoIdPreCheck = () => `pck-${randomUUID()}`;
/** Lo que alcanzó a escribir una revisión con IA que falló (ADR-0016); se borra al empezar la siguiente. */
export const DICTAMEN_PARCIAL = "dictamen.parcial.json";
export const esIdPreCheck = (id: string) => ID.test(id);

export function carpetaPreCheck(id: string): string {
  if (!esIdPreCheck(id)) throw new Error("Identificador de PreCheck no válido.");
  return join(/* turbopackIgnore: true */ raizPreChecks(), id);
}

/** Lo que el usuario confirma antes de ejecutar: con esto el motor sabe qué norma y zona aplicar. */
export interface DatosPreCheck {
  nombreProyecto: string;
  tramite: string;
  /** AAAA-MM-DD */
  fechaPresentacion: string;
  normaAplicable: string;
  codigoZona?: string;
  /** Declaraciones sí/no opcionales del expediente (decisión D9). Sin responder, el motor deja esas reglas en revisión. */
  declaraciones?: Declaraciones;
  /**
   * Cuadro de datos del anteproyecto (paso 0): números declarados por el usuario, por ruta del hecho del motor
   * («proyecto.retiro_posterior_m», «lote.area_m2», «acceso_vehicular.rotura_cordon_m»…; ver lib/datos-declarados).
   */
  datosDeclarados?: Record<string, number>;
  /**
   * «Variables definidas»: claves que el arquitecto decide al 100 % («lote.codigo_zona» o una del cuadro de datos). Se imponen
   * sobre la lectura y la IA con confianza 1 y nadie las cuestiona (precheck/planos/definidas.py).
   */
  definidas?: string[];
}

/** Clave de la zona entre las variables definidas. */
export const CLAVE_ZONA_DEFINIDA = "lote.codigo_zona";

/** Los valores de las variables definidas, por clave (lo que se escribe en definidas.json). */
export function valoresDefinidos(d: DatosPreCheck): Record<string, string | number> {
  const salida: Record<string, string | number> = {};
  for (const clave of d.definidas ?? []) {
    const valor = clave === CLAVE_ZONA_DEFINIDA ? d.codigoZona : d.datosDeclarados?.[clave];
    if (valor !== undefined && valor !== "") salida[clave] = valor;
  }
  return salida;
}

/** Datos del Acuerdo 110 (Anexos III y IV) que no salen del plano y que el solicitante puede declarar. */
export interface Declaraciones {
  esUrbanizacionOParcelacion?: boolean;
  servidumbreOtraEntidad?: boolean;
  servidumbreFluvialOPluvial?: boolean;
  requiereBcbrp?: boolean;
}

export const CLAVES_DECLARACIONES = ["esUrbanizacionOParcelacion", "servidumbreOtraEntidad", "servidumbreFluvialOPluvial", "requiereBcbrp"] as const;

/** Solo conserva los sí/no que llegaron como booleanos; lo demás (vacío, texto) se ignora. */
export function limpiarDeclaraciones(crudo: unknown): Declaraciones | undefined {
  const d = (crudo ?? {}) as Record<string, unknown>;
  const salida: Declaraciones = {};
  for (const k of CLAVES_DECLARACIONES) if (typeof d[k] === "boolean") salida[k] = d[k] as boolean;
  return Object.keys(salida).length ? salida : undefined;
}

export type EstadoIa = { status: "running" | "done" | "failed"; proveedor: "claude-code" | "anthropic-api" | "deepseek-api"; modelo: string; error?: string; actualizadoEn: string; retomas?: number; pendientesAntes?: number; pendientesDespues?: number; aviso?: string; xtra?: EstadoXtra; enrutado?: string; modeloPedido?: string };

/** Revisión XTRA: un agente maestro revisa lo que dijeron varios agentes empleados (server/ia/xtra.ts). */
export type EstadoXtra = { empleados: number; modeloEmpleados: string; fase: "empleados" | "maestro"; terminados: number; fallidos: number };

/** El estado de la revisión con IA tal como lo ve la web: con la espera de turno y la última actividad si está en curso. */
export type EstadoIaVigente = EstadoIa & {
  /** Tiene la revisión pedida pero todavía no le toca turno (hay un máximo de revisiones a la vez). */
  enEspera?: boolean;
  /** Última línea escrita en el registro (ISO); null si aún no hay. */
  ultimaActividad?: string | null;
  /** Segundos desde esa última actividad, medidos por el servidor (el reloj del navegador no interviene). */
  segundosSinActividad?: number | null;
  revisionesCorriendo?: number;
  revisionesEsperando?: number;
  maxParalelo?: number;
};

export interface EstadoPreCheck {
  status: "queued" | "running" | "done" | "failed";
  projectId: string;
  planIds: string[];
  datos: DatosPreCheck;
  createdAt: string;
  updatedAt: string;
  error?: string;
  ia?: EstadoIa;
}

export async function leerEstadoPreCheck(id: string): Promise<EstadoPreCheck> {
  return JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaPreCheck(id), "estado.json"), "utf8")) as EstadoPreCheck;
}

export async function escribirEstadoPreCheck(id: string, cambios: Partial<EstadoPreCheck>): Promise<EstadoPreCheck> {
  const previo = await leerEstadoPreCheck(id).catch(() => null);
  const estado = { ...previo, ...cambios, updatedAt: new Date().toISOString() } as EstadoPreCheck;
  await writeFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ carpetaPreCheck(id), "estado.json"), JSON.stringify(estado));
  return estado;
}

export async function crearPreCheck(projectId: string, planIds: string[], datos: DatosPreCheck): Promise<string> {
  const id = nuevoIdPreCheck();
  await mkdir(/* turbopackIgnore: true */ carpetaPreCheck(id), { recursive: true });
  const ahora = new Date().toISOString();
  await escribirEstadoPreCheck(id, { status: "queued", projectId, planIds, datos, createdAt: ahora });
  return id;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Códigos como RLA, RDP, OBRAS_MENORES o PAGO_EXCEPCIONAL_COMPENSACION (con guion bajo, hasta 40 caracteres).
const TRAMITE = /^[A-Za-z0-9][A-Za-z0-9 _\-]{0,39}$/;

/** Valida lo que llega del cliente. Devuelve los datos limpios o el mensaje para el usuario. */
export function validarDatos(crudo: unknown): { datos: DatosPreCheck } | { mensaje: string } {
  const d = (crudo ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const normaAplicable = texto(d.normaAplicable, 60);
  if (!esNormaConocida(normaAplicable)) return { mensaje: "Elija la norma aplicable al lote." };
  const tramite = texto(d.tramite, 40);
  if (!TRAMITE.test(tramite)) return { mensaje: "Indique el trámite (por ejemplo RLA)." };
  const fechaPresentacion = texto(d.fechaPresentacion, 10);
  if (!FECHA.test(fechaPresentacion) || Number.isNaN(Date.parse(fechaPresentacion))) return { mensaje: "La fecha de presentación debe ser AAAA-MM-DD." };
  const codigoZona = texto(d.codigoZona, 40);
  const declaraciones = limpiarDeclaraciones(d.declaraciones);
  const declarados = validarDatosDeclarados(d.datosDeclarados);
  if ("mensaje" in declarados) return { mensaje: declarados.mensaje };
  const datosDeclarados = declarados.datos;
  // Solo se pueden definir la zona (si se indicó) y los datos del cuadro que traen valor.
  const definidas = Array.isArray(d.definidas)
    ? [...new Set(d.definidas.filter((c): c is string => typeof c === "string" && ((c === CLAVE_ZONA_DEFINIDA && Boolean(codigoZona)) || datosDeclarados?.[c] !== undefined)))]
    : [];
  return {
    datos: {
      nombreProyecto: texto(d.nombreProyecto, 120) || "Proyecto",
      tramite,
      fechaPresentacion,
      normaAplicable,
      ...(codigoZona ? { codigoZona } : {}),
      ...(declaraciones ? { declaraciones } : {}),
      ...(datosDeclarados ? { datosDeclarados } : {}),
      ...(definidas.length ? { definidas } : {}),
    },
  };
}
