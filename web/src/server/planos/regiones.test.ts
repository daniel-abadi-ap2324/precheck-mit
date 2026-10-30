// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { regionesFalsas } from "@/test/regiones-falsas";

const { guardarPlano } = await import("./almacen");
const { ErrorSinRegiones, estadoPropuesta, esperarRegiones, guardarRegiones, leerRegiones, modeloVision, proponerRegiones } = await import("./regiones");
const { ErrorRegiones } = await import("@/lib/regiones");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "regiones-"));
  process.env.PLANOS_DIR = join(dir, "planos");
  // Configuración de IA de la prueba (sin ia.json: Claude Code con Sonnet).
  process.env.IA_DIR = join(dir, "ia");
  regionesFalsas(dir);
  delete process.env.REGIONES_MODO;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_REGIONES;
  delete process.env.REGIONES_MODO;
  delete process.env.IA_DIR;
});

const PAGINAS = { "1": { imagen: "r1.png", ancho_px: 200, alto_px: 100, escala: 200 } };
const CUADRADO = [
  [0.1, 0.1],
  [0.3, 0.1],
  [0.3, 0.3],
  [0.1, 0.3],
];
const propuesta = (extra: Record<string, unknown> = {}) => ({
  id: "r-a",
  pagina: 1,
  tipo: "estacionamiento",
  puntos: CUADRADO,
  origen: "vision",
  confianza: 0.5,
  etiqueta: "",
  confirmada: false,
  editada: false,
  ...extra,
});

async function planConRegiones(regiones: unknown[] = [propuesta()]) {
  const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
  writeFileSync(join(dir, "planos", id, "regiones.json"), JSON.stringify({ version: 1, generado: "g1", paginas: PAGINAS, regiones }));
  return id;
}

describe("leerRegiones / guardarRegiones", () => {
  it("sin regiones.json devuelve null y no deja guardar", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    expect(await leerRegiones(id)).toBeNull();
    await expect(guardarRegiones(id, [])).rejects.toBeInstanceOf(ErrorSinRegiones);
  });

  it("un archivo que no cumple el contrato lanza ErrorRegiones", async () => {
    const id = await planConRegiones([propuesta({ tipo: "piscina" })]);
    await expect(leerRegiones(id)).rejects.toBeInstanceOf(ErrorRegiones);
  });

  it("el servidor decide origen, «editada» y confianza: no se fía del cliente", async () => {
    const id = await planConRegiones([propuesta(), propuesta({ id: "r-b", tipo: "lote", origen: "vectorial", confianza: 0.7 })]);
    const g = await guardarRegiones(id, [
      // Se movió un vértice: pasa a editada y humano (aunque el cliente diga «vectorial» y confianza 1).
      { id: "r-a", pagina: 1, tipo: "estacionamiento", puntos: [[0.12, 0.1], ...CUADRADO.slice(1)], origen: "vectorial", confianza: 1, confirmada: false },
      // Solo se confirmó: conserva el origen.
      { id: "r-b", pagina: 1, tipo: "lote", puntos: CUADRADO, confirmada: true },
      // Nueva: la dibujó la persona.
      { id: "r-nueva", pagina: 1, tipo: "acera", puntos: CUADRADO, etiqueta: " acera norte " },
    ]);
    const por = Object.fromEntries(g.regiones.map((r) => [r.id, r]));
    expect(por["r-a"]).toMatchObject({ origen: "humano", editada: true, confirmada: false, confianza: 0.7 });
    expect(por["r-b"]).toMatchObject({ origen: "vectorial", editada: false, confirmada: true, confianza: 0.8 });
    expect(por["r-nueva"]).toMatchObject({ origen: "humano", editada: false, confianza: 0.7, etiqueta: "acera norte" });
    expect(g.generado).toBe("g1");
    expect(JSON.parse(readFileSync(join(dir, "planos", id, "regiones.json"), "utf8")).regiones).toHaveLength(3);
  });

  it("rechaza tipos no permitidos, puntos fuera de la página, pocos vértices, páginas inexistentes e ids repetidos", async () => {
    const id = await planConRegiones();
    const malos = [
      [{ ...propuesta(), tipo: "piscina" }],
      [{ ...propuesta(), puntos: [[0, 0], [1.1, 0], [1, 1]] }],
      [{ ...propuesta(), puntos: [[0, 0], [1, 0]] }],
      [{ ...propuesta(), pagina: 7 }],
      [propuesta(), propuesta()],
      "no es lista",
      Array.from({ length: 501 }, (_, i) => propuesta({ id: `r-${i}` })),
    ];
    for (const m of malos) await expect(guardarRegiones(id, m)).rejects.toBeInstanceOf(ErrorRegiones);
  });
});

describe("proponerRegiones (Python simulado)", () => {
  it("lanza el CLI con proponer --pdf --salida --extraccion y --vision; deja el estado listo", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    await proponerRegiones(id, { vision: true });
    expect((await estadoPropuesta(id)).status).toBe("processing");
    await esperarRegiones();
    const args = JSON.parse(readFileSync(join(dir, "planos", id, "args.json"), "utf8")) as string[];
    expect(args[0]).toBe("proponer");
    expect(args).toEqual(expect.arrayContaining(["--pdf", join(dir, "planos", id, "original.pdf"), "--salida", join(dir, "planos", id), "--vision", "--extraccion"]));
    expect(await estadoPropuesta(id)).toMatchObject({ status: "ready", vision: true });
    expect((await leerRegiones(id))?.regiones.map((r) => r.id)).toEqual(["r-vision"]);
  });

  it("con visión pasa el modelo de la configuración de IA; sin visión, ninguno", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    expect(await proponerRegiones(id, { vision: true })).toEqual({ status: "processing", vision: true, modelo: "claude-sonnet-5-5" });
    await esperarRegiones();
    let args = JSON.parse(readFileSync(join(dir, "planos", id, "args.json"), "utf8")) as string[];
    expect(args[args.indexOf("--modelo") + 1]).toBe("claude-sonnet-5-5");
    expect(args).not.toContain("--gasto");
    expect(await estadoPropuesta(id)).toMatchObject({ status: "ready", vision: true, modelo: "claude-sonnet-5-5" });
    expect(await modeloVision()).toEqual({ id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5" });

    await proponerRegiones(id);
    await esperarRegiones();
    args = JSON.parse(readFileSync(join(dir, "planos", id, "args.json"), "utf8")) as string[];
    expect(args).not.toContain("--vision");
    expect(args).not.toContain("--modelo");
  });

  it("con DeepSeek configurado pasa deepseek-flash y la carpeta del gasto; la llave nunca va en los argumentos", async () => {
    mkdirSync(join(dir, "ia"), { recursive: true });
    writeFileSync(join(dir, "ia", "ia.json"), JSON.stringify({ proveedor: "deepseek-api", modelo: "deepseek-flash" }));
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    await proponerRegiones(id, { vision: true });
    await esperarRegiones();
    const args = JSON.parse(readFileSync(join(dir, "planos", id, "args.json"), "utf8")) as string[];
    expect(args[args.indexOf("--modelo") + 1]).toBe("deepseek-flash");
    expect(args[args.indexOf("--gasto") + 1]).toBe(join(dir, "ia"));
    expect(args.join(" ")).not.toMatch(/sk-|DEEPSEEK_API_KEY/);
    expect(await modeloVision()).toEqual({ id: "deepseek-flash", nombre: "DeepSeek Flash" });
  });

  it("con la IA apagada, la visión no usa una API de pago aunque el modelo guardado sea DeepSeek", async () => {
    mkdirSync(join(dir, "ia"), { recursive: true });
    writeFileSync(join(dir, "ia", "ia.json"), JSON.stringify({ proveedor: "ninguno", modelo: "deepseek-flash" }));
    expect(await modeloVision()).toEqual({ id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5" });
  });

  it("respeta las regiones de la persona aunque Python las pierda", async () => {
    const id = await planConRegiones([propuesta({ id: "r-mia", confirmada: true }), propuesta({ id: "r-auto-vieja" })]);
    process.env.REGIONES_MODO = "olvida";
    await proponerRegiones(id);
    await esperarRegiones();
    const ids = (await leerRegiones(id))?.regiones.map((r) => r.id);
    expect(ids).toContain("r-mia");
    expect(ids).toContain("r-auto");
    expect(ids).not.toContain("r-auto-vieja");
  });

  it("si Python falla o escribe algo inválido, restaura las regiones anteriores y marca el fallo", async () => {
    const id = await planConRegiones([propuesta({ id: "r-mia", editada: true, origen: "humano" })]);
    for (const modo of ["falla", "rota"]) {
      process.env.REGIONES_MODO = modo;
      await proponerRegiones(id);
      await esperarRegiones();
      expect(await estadoPropuesta(id)).toMatchObject({ status: "failed", error: expect.stringMatching(/No se pudieron proponer/) });
      expect((await leerRegiones(id))?.regiones.map((r) => r.id)).toEqual(["r-mia"]);
    }
  });
});
