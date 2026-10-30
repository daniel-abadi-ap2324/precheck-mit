import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carpetaDe, escribirEstado, esIdValido, esPdf, guardarPlano, leerEstado, nuevoId } from "./almacen";
import { regionesFalsas } from "@/test/regiones-falsas";
import { encolarExtraccion, esperarCola, estadoVigente } from "./procesar";
import { esperarRegiones, estadoPropuesta, leerRegiones } from "./regiones";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "planos-"));
  process.env.PLANOS_DIR = dir;
  // Cada plano leído encola la propuesta de regiones: sin esto lanzaría el Python real.
  regionesFalsas(dir);
});
afterEach(async () => {
  await esperarRegiones();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PLANOS_EXTRACTOR;
  delete process.env.PRECHECK_REGIONES;
  delete process.env.REGIONES_MODO;
});

/** Extractor falso: un script de Node que escribe extraccion.json (o falla si el PDF dice «romper»). */
function extractorFalso() {
  const script = join(dir, "extractor.mjs");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
     const [pdf, , salida] = process.argv.slice(2);
     if (readFileSync(pdf, "utf8").includes("romper")) { console.error("PDF dañado"); process.exit(1); }
     mkdirSync(salida, { recursive: true });
     writeFileSync(salida + "/extraccion.json", JSON.stringify({ documento: "x.pdf", paginas: [{ numero: 1 }] }));`,
  );
  process.env.PLANOS_EXTRACTOR = `"${process.execPath}" "${script}"`;
}

describe("almacén de planos", () => {
  it("ids propios y validados: nada de rutas arbitrarias", () => {
    const id = nuevoId();
    expect(esIdValido(id)).toBe(true);
    for (const malo of ["../etc", "plan-..%2f", "", "plan-a/b", "x".repeat(80)]) expect(esIdValido(malo)).toBe(false);
    expect(() => carpetaDe("../../etc")).toThrow();
  });

  it("solo acepta PDF de verdad (firma %PDF), no por la extensión", () => {
    expect(esPdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(esPdf(Buffer.from("MZ\x90\x00 ejecutable"))).toBe(false);
  });

  it("guarda el original fuera de public/ y deja el estado «en cola»", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7 hola"), "A-101.pdf");
    expect(readFileSync(join(dir, id, "original.pdf"), "utf8")).toBe("%PDF-1.7 hola");
    expect(await leerEstado(id)).toMatchObject({ status: "queued", fileName: "A-101.pdf" });
  });
});

describe("extracción en cola", () => {
  it("procesa uno a la vez y deja «listo» con la extracción, o «falló» con un mensaje para el usuario", async () => {
    extractorFalso();
    const bueno = await guardarPlano(Buffer.from("%PDF-1.7 bien"), "bien.pdf");
    const malo = await guardarPlano(Buffer.from("%PDF-1.7 romper"), "malo.pdf");
    encolarExtraccion(bueno);
    encolarExtraccion(malo);
    expect((await leerEstado(malo)).status).toBe("queued");
    await esperarCola();
    expect(await leerEstado(bueno)).toMatchObject({ status: "ready" });
    expect(existsSync(join(dir, bueno, "extraccion.json"))).toBe(true);
    const e = await leerEstado(malo);
    expect(e.status).toBe("failed");
    expect(e.error).toBe("No se pudo leer el plano. Verifique que el PDF no esté dañado ni protegido.");
    expect(e.error).not.toMatch(/dañado"/);
  });
});

describe("lectura interrumpida", () => {
  it("un plano que quedó «leyendo» sin lectura en curso (reinicio del servidor) se vuelve a encolar", async () => {
    extractorFalso();
    const id = await guardarPlano(Buffer.from("%PDF-1.7 bien"), "bien.pdf");
    await escribirEstado(id, { status: "processing" });
    expect((await estadoVigente(id)).status).toBe("queued");
    await esperarCola();
    expect((await leerEstado(id)).status).toBe("ready");
  });
});

describe("propuesta automática de regiones al terminar la lectura", () => {
  it("un plano recién leído recibe la propuesta vectorial (sin visión)", async () => {
    extractorFalso();
    const id = await guardarPlano(Buffer.from("%PDF-1.7 bien"), "bien.pdf");
    encolarExtraccion(id);
    await esperarCola();
    expect((await leerEstado(id)).status).toBe("ready");
    await esperarRegiones();
    const args = JSON.parse(readFileSync(join(dir, id, "args.json"), "utf8")) as string[];
    expect(args[0]).toBe("proponer");
    expect(args).not.toContain("--vision");
    expect(await estadoPropuesta(id)).toMatchObject({ status: "ready", vision: false });
    expect((await leerRegiones(id))?.regiones).toEqual([expect.objectContaining({ id: "r-auto", origen: "vectorial" })]);
  });

  it("no toca un regiones.json que ya existe, aunque esté dañado (puede llevar trabajo de la persona)", async () => {
    extractorFalso();
    const id = await guardarPlano(Buffer.from("%PDF-1.7 bien"), "bien.pdf");
    writeFileSync(join(dir, id, "regiones.json"), "{");
    encolarExtraccion(id);
    await esperarCola();
    await esperarRegiones();
    expect((await leerEstado(id)).status).toBe("ready");
    expect(readFileSync(join(dir, id, "regiones.json"), "utf8")).toBe("{");
    expect(existsSync(join(dir, id, "args.json"))).toBe(false);
  });

  it("si la propuesta falla, el plano igual queda leído", async () => {
    extractorFalso();
    process.env.REGIONES_MODO = "falla";
    const id = await guardarPlano(Buffer.from("%PDF-1.7 bien"), "bien.pdf");
    encolarExtraccion(id);
    await esperarCola();
    await esperarRegiones();
    expect(await leerEstado(id)).toMatchObject({ status: "ready" });
    expect((await estadoPropuesta(id)).status).toBe("failed");
    expect(await leerRegiones(id)).toBeNull();
  });

  it("un plano que no se pudo leer no recibe propuesta", async () => {
    extractorFalso();
    const id = await guardarPlano(Buffer.from("%PDF-1.7 romper"), "malo.pdf");
    encolarExtraccion(id);
    await esperarCola();
    await esperarRegiones();
    expect((await leerEstado(id)).status).toBe("failed");
    expect((await estadoPropuesta(id)).status).toBe("idle");
  });
});
