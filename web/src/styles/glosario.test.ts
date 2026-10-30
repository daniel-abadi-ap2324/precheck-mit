import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Glosario de la interfaz (docs/features/plataforma-web/_review/ux-2026-09-27.md): un término por concepto.
 * Recorre los textos entre comillas y en JSX de src/ (sin pruebas) y falla si aparece un término descartado.
 */
const DESCARTADOS: [RegExp, string][] = [
  [/Parcel ID/, "ID del lote"],
  [/\b[Pp]arcelas?\b/, "lote"],
  [/ID de propiedad|^Propiedad$/, "ID del lote"],
  [/\b[Ss]ubi(r|endo|da|do)\b/, "cargar"],
  [/Mapa GIS|Vista GIS/, "Mapa"],
  [/[Ss]in etiqueta|[Ss]in rótulo/, "Sin código"],
  [/\bworkspace\b/, "Revisión"],
  [/\bbackend\b|FastAPI|src\/mocks/, "texto para el usuario"],
];

const RAIZ = join(__dirname, "..");
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "mocks" || n === "test" ? [] : archivos(p);
    return /\.(tsx?|ts)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Textos visibles aproximados: literales entre comillas o backticks y texto entre etiquetas JSX (sin comentarios ni imports). */
function textos(fuente: string): string[] {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^import .*$/gm, "");
  const literales = [...sinComentarios.matchAll(/"([^"\n]{3,})"|`([^`]{3,})`|>([^<>{}\n]{3,})</g)].map((m) => m[1] ?? m[2] ?? m[3]);
  // Fuera: rutas, clases CSS y claves técnicas (sin espacios ni mayúscula inicial con acento…).
  return literales.filter((t) => /\s/.test(t) && !/^[\w\-/.:@[\]()%, ]+$/.test(t.trim()) || /^[A-ZÁÉÍÓÚ]/.test(t.trim()));
}

describe("glosario de la interfaz", () => {
  it("ningún texto visible usa un término descartado", () => {
    const hallazgos: string[] = [];
    for (const f of archivos(RAIZ)) {
      for (const t of textos(readFileSync(f, "utf8"))) {
        for (const [re, usar] of DESCARTADOS) {
          if (re.test(t)) hallazgos.push(`${f.replace(RAIZ + "/", "")}: «${t.trim().slice(0, 70)}» → ${usar}`);
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });
});
