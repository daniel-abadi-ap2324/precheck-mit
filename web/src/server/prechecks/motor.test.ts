// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { carpetaPreCheck, crearPreCheck } = await import("./almacen");
const { loteJson, prepararEntradas } = await import("./motor");

const PLAN = "plan-11111111-2222-4333-8444-555555555555";
const DATOS = { nombreProyecto: "Prueba", tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021", codigoZona: "RM1" };
let dir: string;

/** Motor falso: cuenta las reglas según lo que trae lote.json (con datos de la IA evalúa menos reglas). */
function motorFalso() {
  const script = join(dir, "revisor.mjs");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
     const a = process.argv.slice(2); const v = (k) => a[a.indexOf(k) + 1];
     const lote = JSON.parse(readFileSync(v("--lote"), "utf8"));
     const conDatosDeIa = Boolean(lote.proyecto);
     const reglas = conDatosDeIa ? 1 : 3;
     writeFileSync(v("--salida") + "/hechos.json", JSON.stringify({ tramite: lote.tramite }));
     writeFileSync(v("--salida") + "/resultado.json", JSON.stringify({ resultados: Array.from({ length: reglas }, (_, i) => ({ regla_id: "R-" + i, resultado: "REQUIERE_REVISION" })) }));`,
  );
  process.env.PRECHECK_REVISOR = `"${process.execPath}" "${script}"`;
}

function planListo() {
  const carpeta = join(dir, "planos", PLAN);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "estado.json"), JSON.stringify({ status: "ready", fileName: "a.pdf", sizeBytes: 1, updatedAt: "2026-10-01T00:00:00Z" }));
  writeFileSync(join(carpeta, "extraccion.json"), JSON.stringify({ formato: "1.0.0", documento: "a.pdf", sha256: "0", paginas: [], hechos: [], escalas: [], requisitos_anexo_iv: [] }));
  writeFileSync(join(carpeta, "p1.png"), "png");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "motor-"));
  process.env.PLANOS_DIR = join(dir, "planos");
  process.env.PRECHECKS_DIR = join(dir, "prechecks");
  motorFalso();
  planListo();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_REVISOR;
});

describe("prepararEntradas", () => {
  it("reescribe lote.json y extraccion.json y vuelve a evaluar: lo que dejó una revisión anterior desaparece", async () => {
    const id = await crearPreCheck("prj-1", [PLAN], DATOS);
    const carpeta = carpetaPreCheck(id);
    expect((await prepararEntradas(id))?.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(carpeta, "resultado.json"), "utf8")).resultados).toHaveLength(3);

    // La IA completó lote.json y reevaluó: ahora el motor da otro resultado.
    writeFileSync(join(carpeta, "lote.json"), JSON.stringify({ ...loteJson(DATOS), proyecto: { retiro_posterior_m: { valor: 2.2 } } }));
    expect((await prepararEntradas(id))?.ok).toBe(true);
    // Al reabrir la revisión se parte otra vez de lo confirmado por el usuario.
    expect(JSON.parse(readFileSync(join(carpeta, "lote.json"), "utf8"))).toEqual(loteJson(DATOS));
    expect(JSON.parse(readFileSync(join(carpeta, "resultado.json"), "utf8")).resultados).toHaveLength(3);
  });

  it("devuelve null si ningún plano del proyecto está listo, y ok=false si el motor falla", async () => {
    const id = await crearPreCheck("prj-1", [PLAN], DATOS);
    writeFileSync(join(dir, "planos", PLAN, "estado.json"), JSON.stringify({ status: "processing", fileName: "a.pdf", sizeBytes: 1, updatedAt: "x" }));
    expect(await prepararEntradas(id)).toBeNull();
    writeFileSync(join(dir, "planos", PLAN, "estado.json"), JSON.stringify({ status: "ready", fileName: "a.pdf", sizeBytes: 1, updatedAt: "x" }));
    writeFileSync(join(dir, "falla.mjs"), 'console.error("fallo"); process.exit(1);');
    process.env.PRECHECK_REVISOR = `"${process.execPath}" "${join(dir, "falla.mjs")}"`;
    expect((await prepararEntradas(id))?.ok).toBe(false);
  });
});

describe("prepararEntradas: regiones del plano", () => {
  it("copia regiones.json y r<N>.png del plano; si el plano ya no las tiene, borra las de la ejecución anterior", async () => {
    const plano = join(dir, "planos", PLAN);
    const regiones = { version: 1, generado: "g", paginas: { "1": { imagen: "r1.png", ancho_px: 10, alto_px: 10 } }, regiones: [] };
    writeFileSync(join(plano, "regiones.json"), JSON.stringify(regiones));
    writeFileSync(join(plano, "r1.png"), "png1");
    writeFileSync(join(plano, "r12.png"), "png12");
    writeFileSync(join(plano, "rx.png"), "no");
    const id = await crearPreCheck("prj-1", [PLAN], DATOS);
    const carpeta = carpetaPreCheck(id);
    expect((await prepararEntradas(id))?.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(carpeta, "regiones.json"), "utf8"))).toEqual(regiones);
    expect(readFileSync(join(carpeta, "r1.png"), "utf8")).toBe("png1");
    expect(readFileSync(join(carpeta, "r12.png"), "utf8")).toBe("png12");
    expect(existsSync(join(carpeta, "rx.png"))).toBe(false);

    rmSync(join(plano, "regiones.json"));
    expect((await prepararEntradas(id))?.ok).toBe(true);
    expect(existsSync(join(carpeta, "regiones.json"))).toBe(false);
  });
});
