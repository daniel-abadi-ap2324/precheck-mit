import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Anteproyectos RLA reales (PDF) de la carpeta PLANOS_EJEMPLO_DIR. Sirven de planos de ejemplo para probar la
 * lectura y son también los documentos originales de los expedientes revisados por el agente revisor-planos.
 * Solo se ofrecen sus PDF, por nombre exacto comparado contra el listado (nunca una ruta).
 * `turbopackIgnore`: rutas de datos en tiempo de ejecución; el build no debe rastrear ni copiar esas carpetas.
 */
export const carpetaEjemplos = () => process.env.PLANOS_EJEMPLO_DIR ?? "/home/app/Zonificacion_MUPA/Anteproyecto_Solicitados";

export interface PdfEjemplo {
  nombre: string;
  sizeBytes: number;
  ruta: string;
}

/** PDF de la carpeta, en orden alfabético. Carpeta inexistente: lista vacía. */
export async function listarEjemplos(): Promise<PdfEjemplo[]> {
  const carpeta = carpetaEjemplos();
  const nombres = (await readdir(/* turbopackIgnore: true */ carpeta).catch(() => [] as string[])).filter((n) => n.toLowerCase().endsWith(".pdf")).sort();
  const items = await Promise.all(
    nombres.map(async (nombre) => {
      const ruta = join(/* turbopackIgnore: true */ carpeta, nombre);
      const info = await stat(/* turbopackIgnore: true */ ruta).catch(() => null);
      return info?.isFile() ? { nombre, sizeBytes: info.size, ruta } : null;
    }),
  );
  return items.filter((x): x is PdfEjemplo => x !== null);
}

/** El PDF con ese nombre exacto (comparado contra el listado de la carpeta), o null. */
export async function buscarEjemplo(nombre: string | null | undefined): Promise<PdfEjemplo | null> {
  if (!nombre) return null;
  return (await listarEjemplos()).find((e) => e.nombre === nombre) ?? null;
}
