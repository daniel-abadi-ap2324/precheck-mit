import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ComplianceRule } from "@/types";
import { leerNormas, traducirArchivo } from "./traductor";

/**
 * Catálogo real de reglas del motor (reglas/*.json), leído en tiempo de ejecución para que la web siempre muestre
 * la versión al día. Carpeta: PRECHECK_REGLAS, o ../reglas relativa al directorio de trabajo (web/). Los nombres
 * de las normas salen de PRECHECK_NORMAS, o de precheck/reglas/normas.json junto a esa carpeta.
 */
export const carpetaReglas = () => resolve(/* turbopackIgnore: true */ process.env.PRECHECK_REGLAS ?? join(/* turbopackIgnore: true */ process.cwd(), "..", "reglas"));
export const archivoNormas = () => resolve(/* turbopackIgnore: true */ process.env.PRECHECK_NORMAS ?? join(/* turbopackIgnore: true */ carpetaReglas(), "..", "precheck", "reglas", "normas.json"));

let cache: { firma: string; reglas: ComplianceRule[] } | null = null;

/** Todas las reglas, en el orden de los archivos. Un archivo ilegible se omite y se anota en el registro del servidor. */
export async function leerCatalogo(): Promise<ComplianceRule[]> {
  const dir = carpetaReglas();
  const archivos = (await readdir(/* turbopackIgnore: true */ dir).catch(() => [] as string[])).filter((a) => a.endsWith(".json")).sort();
  const rutas = [...archivos.map((a) => join(/* turbopackIgnore: true */ dir, a)), archivoNormas()];
  const firma = (await Promise.all(rutas.map((r) => stat(/* turbopackIgnore: true */ r).then((s) => `${r}:${s.mtimeMs}:${s.size}`, () => `${r}:-`)))).join(/* turbopackIgnore: true */ "|");
  if (cache && cache.firma === firma) return cache.reglas;
  const normas = leerNormas(await readFile(/* turbopackIgnore: true */ archivoNormas(), "utf8").then(JSON.parse, () => null));
  const porArchivo = await Promise.all(
    archivos.map(async (a) => {
      try {
        return traducirArchivo(JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, a), "utf8")), normas, a);
      } catch (err) {
        console.warn(`[reglas] se omite ${a}: ${err instanceof Error ? err.message.slice(0, 200) : "error"}`);
        return [];
      }
    }),
  );
  const reglas = porArchivo.flat();
  cache = { firma, reglas };
  return reglas;
}
