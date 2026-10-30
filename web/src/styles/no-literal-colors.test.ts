import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\(/gi;

/** Archivos .ts/.tsx/.css de src/, salvo config/ y styles/ (donde viven los colores) y las pruebas. */
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ["config", "styles"].includes(n) && dir === SRC ? [] : archivos(p);
    return /\.(tsx?|css)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Colores solo por tokens (web/CLAUDE.md): la identidad se cambia en styles/tokens.css y src/config. */
describe("sin colores literales fuera de tokens y config", () => {
  it("ningún archivo de src/ (salvo config/ y styles/) escribe un color", () => {
    const hallazgos = archivos(SRC).flatMap((f) => {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      const m = src.match(COLOR);
      return m ? [`${relative(SRC, f)}: ${[...new Set(m)].join(" ")}`] : [];
    });
    expect(hallazgos).toEqual([]);
  });
});
