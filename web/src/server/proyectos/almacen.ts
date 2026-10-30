import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { esNombreDePrueba } from "@/lib/corridas-prueba";
import type { Parcel, PlanFormat, Project, ProjectStatus } from "@/types";

/**
 * Proyectos creados en la web (asistente «Nuevo PreCheck»). Antes vivían solo en la memoria del navegador y se
 * perdían al recargar; ahora cada uno es un archivo .data/proyectos/<id>.json con sus datos, el lote (si se dibujó)
 * y la lista de sus planos. PROYECTOS_DIR permite ubicarlos en otro disco.
 */
export const raizProyectos = () =>
  resolve(/* turbopackIgnore: true */ process.env.PROYECTOS_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "proyectos"));

export const PREFIJO_PROYECTO_WEB = "prj-web-";
const ID = /^prj-web-[0-9a-f]{12}$/;
export const esIdProyectoWeb = (id: string) => ID.test(id);
const nuevoId = () => `${PREFIJO_PROYECTO_WEB}${randomUUID().replace(/-/g, "").slice(0, 12)}`;

export interface PlanDelProyecto {
  id: string;
  fileName: string;
  format: PlanFormat;
  sizeBytes: number;
}

export interface ProyectoGuardado {
  project: Project;
  /** Lote dibujado por el profesional (DECL-…): sin él, la ficha del lote no se puede rearmar tras recargar. */
  loteDibujado?: Parcel;
  planes: PlanDelProyecto[];
}

function archivo(id: string): string {
  if (!esIdProyectoWeb(id)) throw new Error("Identificador de proyecto no válido.");
  return join(/* turbopackIgnore: true */ raizProyectos(), `${id}.json`);
}

/** Escritura atómica: primero a un temporal y luego se renombra (un proyecto nunca queda a medias). */
async function guardar(p: ProyectoGuardado): Promise<ProyectoGuardado> {
  await mkdir(/* turbopackIgnore: true */ raizProyectos(), { recursive: true });
  const destino = archivo(p.project.id);
  const tmp = `${destino}.${process.pid}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(p, null, 1));
  await rename(/* turbopackIgnore: true */ tmp, destino);
  return p;
}

export async function leerProyecto(id: string): Promise<ProyectoGuardado | null> {
  if (!esIdProyectoWeb(id)) return null;
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ archivo(id), "utf8")) as ProyectoGuardado;
  } catch {
    return null;
  }
}

export async function listarProyectos(): Promise<ProyectoGuardado[]> {
  const nombres = await readdir(/* turbopackIgnore: true */ raizProyectos()).catch(() => [] as string[]);
  const ids = nombres.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter(esIdProyectoWeb);
  const leidos = await Promise.all(ids.map(leerProyecto));
  return leidos.filter((p): p is ProyectoGuardado => p !== null).sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Datos del asistente que se guardan (el resto del proyecto lo pone el servidor). */
export function validarEntrada(crudo: unknown): Omit<Project, "id" | "status" | "updatedAt"> | null {
  const d = (crudo ?? {}) as Record<string, unknown>;
  const name = texto(d.name, 120);
  if (name.length < 3) return null;
  return {
    name,
    propertyId: texto(d.propertyId, 40),
    finca: texto(d.finca, 40),
    address: texto(d.address, 200),
    corregimiento: texto(d.corregimiento, 80),
    projectType: texto(d.projectType, 80),
    applicant: texto(d.applicant, 120),
    zoningCode: texto(d.zoningCode, 40),
    ...(texto(d.parcelId, 60) ? { parcelId: texto(d.parcelId, 60) } : {}),
    ...(d.esPrueba === true ? { esPrueba: true } : {}),
  };
}

/** El lote dibujado se guarda tal cual lo calculó el navegador, con un tope de tamaño. */
export function validarLoteDibujado(crudo: unknown): Parcel | undefined {
  if (!crudo || typeof crudo !== "object") return undefined;
  const p = crudo as Parcel;
  if (typeof p.id !== "string" || !/^DECL-[A-Za-z0-9-]{1,40}$/.test(p.id)) return undefined;
  return JSON.stringify(p).length <= 200_000 ? p : undefined;
}

export async function crearProyecto(entrada: Omit<Project, "id" | "status" | "updatedAt">, loteDibujado?: Parcel): Promise<ProyectoGuardado> {
  const datos = { ...entrada };
  delete datos.esPrueba;
  // Corrida de prueba de modelos: la marca la manda lote_ia.py; un nombre con el formato de las pruebas también cuenta.
  const esPrueba = entrada.esPrueba === true || esNombreDePrueba(entrada.name);
  const project: Project = { id: nuevoId(), ...datos, ...(esPrueba ? { esPrueba } : {}), status: "DRAFT", updatedAt: new Date().toISOString() };
  return guardar({ project, ...(loteDibujado ? { loteDibujado } : {}), planes: [] });
}

/** Un nombre de proyecto: texto de 3 a 120 caracteres (como en el asistente), sin saltos de línea. */
export const nombreValido = (v: unknown): v is string => typeof v === "string" && v.trim().length >= 3 && v.trim().length <= 120 && !/[\r\n]/.test(v);

/** Quita el proyecto de la lista. Sus planos y PreCheck quedan en sus carpetas (pueden tener resultados ya vistos). */
export async function eliminarProyecto(id: string): Promise<boolean> {
  if (!(await leerProyecto(id))) return false;
  await rm(/* turbopackIgnore: true */ archivo(id), { force: true });
  return true;
}

export interface CambiosProyecto {
  /** Nombre nuevo (3 a 120 caracteres): ver nombreValido. */
  name?: string;
  status?: ProjectStatus;
  precheckId?: string;
  complianceIndex?: number;
  agregarPlan?: PlanDelProyecto;
  quitarPlan?: string;
}

// Los cambios de un mismo proyecto se aplican de a uno (dos cargas seguidas no se pisan).
const colas = new Map<string, Promise<unknown>>();

export function actualizarProyecto(id: string, cambios: CambiosProyecto): Promise<ProyectoGuardado | null> {
  const previo = colas.get(id) ?? Promise.resolve();
  const siguiente = previo.then(async () => {
    const p = await leerProyecto(id);
    if (!p) return null;
    const { agregarPlan, quitarPlan, ...campos } = cambios;
    let planes = p.planes;
    if (agregarPlan && !planes.some((x) => x.id === agregarPlan.id)) planes = [...planes, agregarPlan];
    if (quitarPlan) planes = planes.filter((x) => x.id !== quitarPlan);
    return guardar({ ...p, planes, project: { ...p.project, ...campos, updatedAt: new Date().toISOString() } });
  });
  colas.set(id, siguiente.catch(() => undefined));
  return siguiente;
}
