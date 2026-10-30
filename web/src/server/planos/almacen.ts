import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Planos cargados: cada uno en su carpeta (original.pdf, estado.json, extraccion.json y miniaturas p<N>.png),
 * fuera de public/ para que solo se sirvan detrás de la sesión. PLANOS_DIR permite ubicarla en otro disco.
 */
export const raiz = () => resolve(/* turbopackIgnore: true */ process.env.PLANOS_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), ".data", "planos"));

import type { LectorOcr } from "@/lib/lector-ocr";

export type EstadoPlano = {
  status: "queued" | "processing" | "ready" | "failed";
  fileName: string;
  sizeBytes: number;
  error?: string;
  /** Lector OCR elegido al subirlo (lib/lector-ocr); sin él, el de por defecto. */
  ocr?: LectorOcr;
  /** «complementario»: memoria, cuadro de áreas, carta… Se lee igual, pero el motor no lo evalúa como plano. */
  rol?: RolDocumento;
  updatedAt: string;
};

export type RolDocumento = "plano" | "complementario";
export const esRolDocumento = (v: unknown): v is RolDocumento => v === "plano" || v === "complementario";

/** ¿El plano se cargó como documento complementario? (Sin estado legible, no.) */
export const esComplementario = async (id: string) => (await leerEstado(id).catch(() => null))?.rol === "complementario";

const ID = /^plan-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const nuevoId = () => `plan-${randomUUID()}`;
export const esIdValido = (id: string) => ID.test(id);

/** Carpeta de un plano; lanza si el id no es uno de los nuestros (nunca una ruta arbitraria). */
export function carpetaDe(id: string): string {
  if (!esIdValido(id)) throw new Error("Identificador de plano no válido.");
  return join(/* turbopackIgnore: true */ raiz(), id);
}

/** Un PDF se reconoce por su firma, no por la extensión del nombre. */
export const esPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

export async function escribirEstado(id: string, cambios: Partial<EstadoPlano>): Promise<EstadoPlano> {
  const previo = await leerEstado(id).catch(() => null);
  const estado = { ...previo, ...cambios, updatedAt: new Date().toISOString() } as EstadoPlano;
  // Escritura atómica: la cola de lectura y la ruta que responde pueden tocar el archivo a la vez.
  const destino = join(carpetaDe(id), "estado.json");
  const tmp = `${destino}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(estado));
  await rename(tmp, destino);
  return estado;
}

export async function leerEstado(id: string): Promise<EstadoPlano> {
  return JSON.parse(await readFile(join(carpetaDe(id), "estado.json"), "utf8")) as EstadoPlano;
}

export async function guardarPlano(contenido: Buffer, fileName: string): Promise<string> {
  const id = nuevoId();
  await mkdir(carpetaDe(id), { recursive: true });
  await writeFile(join(carpetaDe(id), "original.pdf"), contenido);
  await escribirEstado(id, { status: "queued", fileName, sizeBytes: contenido.length });
  return id;
}
