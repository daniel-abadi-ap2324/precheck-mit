import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Python simulado para `precheck.planos.regiones proponer` (PRECHECK_REGIONES). Según REGIONES_MODO: «conserva» (como
 * el real: deja las regiones de la persona), «olvida» (las pierde), «falla» (sale con 1) o «rota» (JSON inválido).
 */
export function regionesFalsas(dir: string): void {
  const script = join(dir, "regiones-falso.mjs");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
     const a = process.argv.slice(2); const v = (k) => a[a.indexOf(k) + 1];
     const modo = process.env.REGIONES_MODO ?? "conserva";
     if (a[0] !== "proponer") process.exit(2);
     const dir = v("--salida");
     writeFileSync(dir + "/args.json", JSON.stringify(a));
     if (modo === "falla") { console.error("fallo"); process.exit(1); }
     if (modo === "rota") { writeFileSync(dir + "/regiones.json", "{"); process.exit(0); }
     let previas = [];
     try { previas = JSON.parse(readFileSync(dir + "/regiones.json", "utf8")).regiones.filter((r) => r.confirmada || r.editada || r.origen === "humano"); } catch {}
     if (modo === "olvida") previas = [];
     const vision = a.includes("--vision");
     const auto = { id: vision ? "r-vision" : "r-auto", pagina: 1, tipo: "lote", puntos: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9]], origen: vision ? "vision" : "vectorial", confianza: vision ? 0.5 : 0.7, etiqueta: "", confirmada: false, editada: false };
     writeFileSync(dir + "/regiones.json", JSON.stringify({ version: 1, generado: new Date().toISOString(), paginas: { "1": { imagen: "r1.png", ancho_px: 200, alto_px: 100, escala: null } }, regiones: [...previas, auto] }));
     writeFileSync(dir + "/r1.png", "png");`,
  );
  process.env.PRECHECK_REGIONES = `"${process.execPath}" "${script}"`;
}
