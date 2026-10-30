import { readFile } from "node:fs/promises";
import { esLectorOcr } from "@/lib/lector-ocr";
import { escribirEstado, guardarPlano } from "@/server/planos/almacen";
import { buscarEjemplo, listarEjemplos } from "@/server/planos/ejemplos";
import { encolarExtraccion } from "@/server/planos/procesar";
import { error } from "@/server/planos/respuestas";

/** Planos de ejemplo (anteproyectos RLA reales) para probar la lectura sin cargar un archivo (server/planos/ejemplos.ts). */
export async function GET() {
  return Response.json({ items: (await listarEjemplos()).map(({ nombre, sizeBytes }) => ({ nombre, sizeBytes })) });
}

export async function POST(request: Request) {
  const { nombre, ocr } = (await request.json().catch(() => ({}))) as { nombre?: string; ocr?: unknown };
  const ejemplo = await buscarEjemplo(nombre);
  if (!ejemplo) return error(404, "plano.ejemplo_inexistente", "Ese plano de ejemplo no existe.");
  const id = await guardarPlano(await readFile(/* turbopackIgnore: true */ ejemplo.ruta), ejemplo.nombre);
  if (esLectorOcr(ocr)) await escribirEstado(id, { ocr });
  encolarExtraccion(id);
  return Response.json({ id, status: "queued", fileName: ejemplo.nombre, sizeBytes: 0, updatedAt: new Date().toISOString() }, { status: 202 });
}
