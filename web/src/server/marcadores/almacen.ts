import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { ID_REGLA } from "@/server/prechecks/revision";
import { MAX_CONCLUSION, MAX_EXTRACTO, MAX_NOTA_MARCADOR, type CambiosMarcador, type EntradaMarcador, type Marcador } from "@/services/marcadores/tipos";

/**
 * Marcadores (ADR-0015): conclusiones de una revisión que el usuario guardó como interesantes o equivocadas. Viven
 * en un solo archivo, .data/marcadores.json (MARCADORES_ARCHIVO para otro lugar), con el mismo cuidado que
 * revision.json: validación con zod, escritura atómica de a una y un archivo dañado es un error, nunca se sobrescribe.
 */
export const archivoMarcadores = () =>
  resolve(/* turbopackIgnore: true */ process.env.MARCADORES_ARCHIVO ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "marcadores.json"));

/** Ids de proyecto y de PreCheck (prj-web-…, exp-…, pck-…, pc-exp-…): sin separadores de ruta. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const idMarcador = /^mrc-[0-9a-f-]{36}$/;

const idSchema = z.string().regex(ID);
const reglaSchema = z
  .string()
  .regex(ID_REGLA)
  .refine((s) => !s.includes(".."), "Id de regla no válido.");
const tipoSchema = z.enum(["interesante", "equivocada"]);
const estadoSchema = z.enum(["PASS", "FAIL", "WARNING", "MANUAL_REVIEW", "NOT_APPLICABLE"]);
const corto = (max: number) => z.string().trim().max(max);

const fotoSchema = z
  .object({
    proyecto: corto(200),
    plano: corto(200),
    modelo: corto(60).nullable(),
    ronda: z.number().int().min(1).max(10_000).nullable(),
    repeticion: z.number().int().min(1).max(100).nullable(),
    regla: z
      .object({
        titulo: corto(300),
        estado: estadoSchema,
        faltaEnPlano: z.boolean().optional(),
        decision: corto(60).optional(),
        justificacion: corto(MAX_EXTRACTO).optional(),
      })
      .strict()
      .nullable(),
    conclusion: corto(MAX_CONCLUSION).optional(),
  })
  .strict();

const marcadorSchema = z
  .object({
    id: z.string().regex(idMarcador),
    projectId: idSchema,
    precheckId: idSchema.nullable(),
    ruleId: reglaSchema.nullable(),
    tipo: tipoSchema,
    nota: z.string().max(MAX_NOTA_MARCADOR),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    foto: fotoSchema,
  })
  .strict();
const archivoSchema = z.object({ version: z.literal(1), marcadores: z.array(marcadorSchema) });

const entradaSchema = z
  .object({
    projectId: idSchema,
    precheckId: idSchema.nullable(),
    ruleId: reglaSchema.nullable(),
    tipo: tipoSchema,
    nota: z.string().trim().max(MAX_NOTA_MARCADOR).optional(),
    foto: fotoSchema,
  })
  .strict();
const cambiosSchema = z
  .object({ tipo: tipoSchema.optional(), nota: z.string().trim().max(MAX_NOTA_MARCADOR).optional() })
  .strict()
  .refine((c) => c.tipo !== undefined || c.nota !== undefined, "Indique el tipo o la nota.");

export class ErrorMarcadores extends Error {}

function mensajeDe(error: z.ZodError): string {
  const issue = error.issues[0];
  const ruta = issue?.path.join(".") ?? "";
  if (ruta === "nota") return `La nota admite hasta ${MAX_NOTA_MARCADOR} caracteres.`;
  if (ruta === "tipo") return "El tipo debe ser «interesante» o «equivocada».";
  if (ruta === "ruleId") return "Id de regla no válido.";
  if (ruta.startsWith("foto")) return "Los datos de la revisión que acompañan al marcador no son válidos o son demasiado largos.";
  return "Marcador no válido.";
}

export function validarEntrada(crudo: unknown): { entrada: EntradaMarcador } | { mensaje: string } {
  const r = entradaSchema.safeParse(crudo);
  return r.success ? { entrada: r.data as EntradaMarcador } : { mensaje: mensajeDe(r.error) };
}

export function validarCambios(crudo: unknown): { cambios: CambiosMarcador } | { mensaje: string } {
  const r = cambiosSchema.safeParse(crudo);
  return r.success ? { cambios: r.data } : { mensaje: r.error.issues[0]?.path.length ? mensajeDe(r.error) : "Indique el tipo o la nota." };
}

export const esIdMarcador = (id: string) => idMarcador.test(id);

/** Lee todos los marcadores. Sin archivo, no hay ninguno; un archivo dañado es un error (no se trata como vacío). */
async function leerTodos(): Promise<Marcador[]> {
  let texto: string;
  try {
    texto = await readFile(/* turbopackIgnore: true */ archivoMarcadores(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new ErrorMarcadores("marcadores.json está dañado.");
  }
  const r = archivoSchema.safeParse(crudo);
  if (!r.success) throw new ErrorMarcadores("marcadores.json no tiene la forma esperada.");
  return r.data.marcadores as Marcador[];
}

/** Más recientes primero; con `projectId`, solo los de ese proyecto. */
export async function leerMarcadores(filtro: { projectId?: string } = {}): Promise<Marcador[]> {
  const todos = await leerTodos();
  return todos.filter((m) => !filtro.projectId || m.projectId === filtro.projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// Un solo archivo para todos: leer, cambiar y escribir van de a uno en todo el proceso (también entre recargas de módulo).
const g = globalThis as typeof globalThis & { __colaMarcadores?: Promise<unknown> };

function enCola<T>(cambio: (todos: Marcador[]) => { todos: Marcador[]; resultado: T }): Promise<T> {
  const tarea = (g.__colaMarcadores ?? Promise.resolve()).then(async () => {
    const { todos, resultado } = cambio(await leerTodos());
    const valido = archivoSchema.parse({ version: 1, marcadores: todos });
    const destino = archivoMarcadores();
    await mkdir(/* turbopackIgnore: true */ dirname(destino), { recursive: true });
    const tmp = `${destino}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(valido, null, 1));
    await rename(/* turbopackIgnore: true */ tmp, destino);
    return resultado;
  });
  g.__colaMarcadores = tarea.catch(() => undefined);
  return tarea;
}

const mismaClave = (m: Marcador, e: EntradaMarcador) => m.projectId === e.projectId && m.precheckId === e.precheckId && m.ruleId === e.ruleId;

/** Guarda un marcador. Hay uno por (proyecto, PreCheck, regla): volver a guardar cambia el tipo, la nota y la foto. */
export function guardarMarcador(entrada: EntradaMarcador, ahora = new Date()): Promise<Marcador> {
  const fecha = ahora.toISOString();
  return enCola((todos) => {
    const previo = todos.find((m) => mismaClave(m, entrada));
    const marcador: Marcador = {
      id: previo?.id ?? `mrc-${randomUUID()}`,
      projectId: entrada.projectId,
      precheckId: entrada.precheckId,
      ruleId: entrada.ruleId,
      tipo: entrada.tipo,
      nota: entrada.nota ?? "",
      createdAt: previo?.createdAt ?? fecha,
      updatedAt: fecha,
      foto: entrada.foto,
    };
    return { todos: [...todos.filter((m) => m !== previo), marcador], resultado: marcador };
  });
}

/** Cambia el tipo o la nota; null si no existe. */
export function editarMarcador(id: string, cambios: CambiosMarcador, ahora = new Date()): Promise<Marcador | null> {
  return enCola((todos) => {
    const previo = todos.find((m) => m.id === id);
    if (!previo) return { todos, resultado: null };
    const marcador = { ...previo, ...(cambios.tipo ? { tipo: cambios.tipo } : {}), ...(cambios.nota !== undefined ? { nota: cambios.nota } : {}), updatedAt: ahora.toISOString() };
    return { todos: todos.map((m) => (m === previo ? marcador : m)), resultado: marcador };
  });
}

/** Quita un marcador; false si no existía. */
export function borrarMarcador(id: string): Promise<boolean> {
  return enCola((todos) => {
    const quedan = todos.filter((m) => m.id !== id);
    return { todos: quedan, resultado: quedan.length < todos.length };
  });
}
