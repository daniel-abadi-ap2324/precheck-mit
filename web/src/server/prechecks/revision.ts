import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { RevisionPreCheck } from "@/types";
import { carpetaPreCheck } from "./almacen";

/**
 * Revisión DOYC de un PreCheck real: revision.json en la carpeta del PreCheck, junto a dictamen.json. La IA propone
 * y una persona confirma o contradice cada decisión (principio 3: el PreCheck es preliminar). El archivo es aparte
 * del dictamen para que una nueva revisión con IA no borre lo que dijo el revisor, ni al revés.
 *
 * Guardar es una fusión por regla, no un reemplazo del archivo: el cliente manda solo las reglas que cambió y el
 * servidor pone la fecha. Así dos pestañas abiertas sobre el mismo PreCheck no se pisan las respuestas.
 */

/** Ids del catálogo («A110-AIII-3-RESUMEN-AREAS») y hallazgos de la IA («HALLAZGO-3»). Nunca separadores de ruta. */
// Admite «X#2» (reglas repetidas en el traductor) y los ids de hallazgos de la IA con espacios o dos puntos.
export const ID_REGLA = /^[A-Za-z0-9][A-Za-z0-9._#: -]{0,119}$/;
export const MAX_NOTA = 500;

const idReglaSchema = z
  .string()
  .regex(ID_REGLA)
  .refine((s) => !s.includes(".."), "Id de regla no válido.");
const accionSchema = z.enum(["confirmar", "contradecir", "pendiente"]);

const decisionSchema = z.object({ accion: accionSchema, nota: z.string().max(MAX_NOTA), fecha: z.iso.datetime() });
export const revisionSchema = z.object({ version: z.literal(1), decisiones: z.record(idReglaSchema, decisionSchema) });

/** Lo que manda el cliente: sin fecha (la pone el servidor) y con la nota opcional, que se recorta. */
const cambiosSchema = z.object({
  decisiones: z
    .record(idReglaSchema, z.object({ accion: accionSchema, nota: z.string().trim().max(MAX_NOTA).optional() }).strict())
    .refine((d) => Object.keys(d).length > 0 && Object.keys(d).length <= 200, "Indique entre 1 y 200 reglas."),
});
export type CambiosRevision = z.infer<typeof cambiosSchema>;

export class ErrorRevision extends Error {}

const vacia = (): RevisionPreCheck => ({ version: 1, decisiones: {} });
const archivo = (id: string) => join(/* turbopackIgnore: true */ carpetaPreCheck(id), "revision.json");

/** Valida lo que llega del cliente. Devuelve los cambios limpios o el mensaje para el usuario. */
export function validarCambios(crudo: unknown): { cambios: CambiosRevision } | { mensaje: string } {
  const r = cambiosSchema.safeParse(crudo);
  if (r.success) return { cambios: r.data };
  const issue = r.error.issues[0];
  if (issue?.path.includes("nota")) return { mensaje: `La nota admite hasta ${MAX_NOTA} caracteres.` };
  if (issue?.path.includes("accion")) return { mensaje: "La acción debe ser confirmar, contradecir o pendiente." };
  return { mensaje: "Revisión no válida: indique, por regla, la acción y una nota opcional." };
}

/**
 * Lee revision.json. Sin archivo, la revisión está vacía. Un archivo dañado es un error (no se trata como vacío):
 * lo contrario permitiría sobrescribir en silencio las respuestas de una persona.
 */
export async function leerRevision(id: string): Promise<RevisionPreCheck> {
  let texto: string;
  try {
    texto = await readFile(/* turbopackIgnore: true */ archivo(id), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return vacia();
    throw e;
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new ErrorRevision("revision.json está dañado.");
  }
  const r = revisionSchema.safeParse(crudo);
  if (!r.success) throw new ErrorRevision("revision.json no tiene la forma esperada.");
  return r.data as RevisionPreCheck;
}

/** Una cola por PreCheck: leer, fusionar y escribir no se mezclan entre dos guardados del mismo PreCheck. */
const colas = new Map<string, Promise<unknown>>();

/** Fusiona los cambios en revision.json (escritura atómica: archivo temporal y rename) y devuelve la revisión completa. */
export function escribirRevision(id: string, cambios: CambiosRevision, ahora = new Date()): Promise<RevisionPreCheck> {
  const destino = archivo(id); // valida el id antes de encolar
  const tarea = (colas.get(id) ?? Promise.resolve()).then(async () => {
    const revision = await leerRevision(id);
    const fecha = ahora.toISOString();
    for (const [regla, c] of Object.entries(cambios.decisiones)) revision.decisiones[regla] = { accion: c.accion, nota: c.nota ?? "", fecha };
    const valida = revisionSchema.parse(revision) as RevisionPreCheck;
    const tmp = `${destino}.${process.pid}.tmp`;
    await writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(valida, null, 1));
    await rename(/* turbopackIgnore: true */ tmp, destino);
    return valida;
  });
  const cola = tarea.catch(() => undefined);
  colas.set(id, cola);
  // Sin guardados pendientes, la entrada se borra para que el mapa no crezca con cada PreCheck revisado.
  void cola.then(() => {
    if (colas.get(id) === cola) colas.delete(id);
  });
  return tarea;
}
