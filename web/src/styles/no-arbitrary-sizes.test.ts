import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/**
 * Tamaños por tokens (globals.css @theme): text-2xs / text-compact para la tipografía, y w-panel-*, w-sidebar,
 * min-h-map-* para el layout. Un valor en píxeles escrito a mano es un tamaño que nadie más reutiliza.
 */
const PROHIBIDOS = [/\btext-\[[^\]]+\]/g, /\b(?:w|min-w|max-w|h|min-h|max-h)-\[\d+px\]/g, /grid-cols-\[[^\]]*\d+px[^\]]*\]/g];

describe("sin tamaños arbitrarios", () => {
  it("tipografía y layout usan tokens, no píxeles sueltos", () => {
    const hallazgos = archivos(SRC).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      // Los primitivos de shadcn (components/ui) conservan sus medidas internas; su tipografía sí va por tokens.
      const reglas = f.replaceAll("\\", "/").includes("/components/ui/") ? PROHIBIDOS.slice(0, 1) : PROHIBIDOS;
      const m = reglas.flatMap((re) => src.match(re) ?? []);
      return m.length ? [`${relative(SRC, f)}: ${[...new Set(m)].join(" ")}`] : [];
    });
    expect(hallazgos).toEqual([]);
  });
});
