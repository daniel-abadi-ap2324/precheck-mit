// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RespuestaRondas } from "@/services/rondas/tipos";

const { GET } = await import("./route");
const { POST } = await import("./recalcular/route");

const conSesion = { cookie: "mp_session=demo-token" };
let dir: string;

const catalogo = (contenido: unknown) => writeFileSync(join(dir, "rondas.json"), typeof contenido === "string" ? contenido : JSON.stringify(contenido));
const metricas = (contenido: unknown) => writeFileSync(join(dir, "metricas.json"), typeof contenido === "string" ? contenido : JSON.stringify(contenido));
const leer = async (headers: Record<string, string> = conSesion) => GET(new Request("http://localhost/api/rondas", { headers }));
const recalcular = (headers: Record<string, string> = conSesion) => POST(new Request("http://localhost/api/rondas/recalcular", { method: "POST", headers }));

const CORRIDA = {
  plano: "Bella Vista",
  modelo: "Sonnet 5.5",
  proveedor: "claude-code",
  precheckId: "pck-1",
  projectId: "prj-1",
  fecha: "2026-10-13T05:00:00Z",
  terminada: true,
  error: null,
  usd: 2.86,
  minutos: 13,
  decisiones: 34,
  lectura: { total: 31, aciertos: 27, dudas: 1, errores: 3, faltan: 0, exactitud: 0.87, detalle: { "lote.area_m2": "acierto", "x.y": "raro" } },
  dictamen: { contradiceMotor: 0, informacionRequerida: 5, externasSinEstado: 0 },
  deepseek: null,
};

/** Script de Node con la misma interfaz que scripts/analisis/rondas.py: escribe el archivo de métricas. */
function scriptFalso({ falla = false, esperaMs = 0 } = {}) {
  const script = join(dir, "rondas.mjs");
  const salida = JSON.stringify({ version: 1, generado: "2026-10-13T12:00:00Z", rondas: [{ ronda: 40, fecha: "2026-10-13", corridas: [CORRIDA, CORRIDA] }] });
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";
     await new Promise((r) => setTimeout(r, ${esperaMs}));
     if (${falla}) { console.error("no se encontró la verdad"); process.exit(1); }
     writeFileSync(${JSON.stringify(join(dir, "metricas.json"))}, ${JSON.stringify(salida)});
     console.log("1 ronda, 2 corridas");`,
  );
  process.env.RONDAS_RECALCULAR = `"${process.execPath}" "${script}"`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rondas-api-"));
  process.env.RONDAS_CATALOGO = join(dir, "rondas.json");
  process.env.RONDAS_METRICAS = join(dir, "metricas.json");
  process.env.RONDAS_ESTABILIDAD = join(dir, "estabilidad.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.RONDAS_CATALOGO;
  delete process.env.RONDAS_METRICAS;
  delete process.env.RONDAS_ESTABILIDAD;
  delete process.env.RONDAS_RECALCULAR;
});

describe("GET /api/rondas", () => {
  it("sin sesión responde 401", async () => {
    expect((await leer({})).status).toBe(401);
  });

  it("sin archivos: los dos faltan, sin avisos ni 500", async () => {
    const r = await leer();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ rondas: [], faltantes: { catalogo: true, metricas: true }, avisos: [], generado: null });
  });

  it("une catálogo y métricas por ronda (de la más antigua a la más reciente)", async () => {
    catalogo({
      version: 1,
      generado: "2026-10-13T10:00:00Z",
      rondas: [
        { ronda: 37, fecha: "2026-10-13", tanda: "Tanda 7", titulo: "El dictamen como producto", cambio: "Jerarquía motor → IA", hipotesis: "h", resultado: "0 contradicciones", modelos: ["Sonnet 5.5"], planos: ["Bella Vista"], informe: "docs/demo/tanda7-13oct.md", commits: ["9b1e3d6"], etapa: "dictamen" },
        { ronda: 36, fecha: "2026-10-12", titulo: "Línea base", etapa: "linea-base" },
      ],
    });
    metricas({
      version: 1,
      generado: "2026-10-13T11:00:00Z",
      verdad: { datos: 369, archivo: "docs/demo/verdad-datos-disputados.json" },
      rondas: [
        { ronda: 37, fecha: "2026-10-13", corridas: [CORRIDA] },
        { ronda: 38, fecha: "2026-10-13", corridas: [{ ...CORRIDA, modelo: "Opus 5.5", plano: "Tocumen", terminada: false, error: "límite de uso", lectura: { total: 10, aciertos: 9 } }] },
      ],
      planos: ["Bella Vista", "Tocumen"],
      modelos: ["Sonnet 5.5", "Opus 5.5"],
    });
    const datos = (await (await leer()).json()) as RespuestaRondas;
    expect(datos.faltantes).toEqual({ catalogo: false, metricas: false });
    expect(datos.generado).toBe("2026-10-13T11:00:00Z");
    // Lo que rondas.py sigue escribiendo de la lectura contra la verdad no llega a la página (ADR-0015).
    expect(datos).not.toHaveProperty("verdad");
    expect(datos.rondas.map((r) => [r.ronda, r.documentada, r.corridas.length])).toEqual([
      [36, true, 0],
      [37, true, 1],
      [38, false, 1],
    ]);
    const r37 = datos.rondas[1];
    expect(r37).toMatchObject({ tanda: "Tanda 7", etapa: "dictamen", commits: ["9b1e3d6"], informe: "docs/demo/tanda7-13oct.md" });
    expect(r37.corridas[0]).not.toHaveProperty("lectura");
    // Una ronda sin catálogo toma modelos y planos de sus corridas.
    const r38 = datos.rondas[2];
    expect(r38).toMatchObject({ etapa: null, titulo: null, modelos: ["Opus 5.5"], planos: ["Tocumen"] });
    expect(r38.corridas[0]).toMatchObject({ terminada: false, error: "límite de uso", repeticion: 1 });
    expect(datos.modelos).toEqual(["Sonnet 5.5", "Opus 5.5"]);
    expect(datos.planos).toEqual(["Bella Vista", "Tocumen"]);
  });

  it("un archivo malformado queda como faltante con aviso; entradas sueltas mal formadas se omiten", async () => {
    catalogo("{ esto no es json");
    metricas({ rondas: [{ ronda: 40, corridas: [CORRIDA, { modelo: "sin plano" }] }, { ronda: "cuarenta" }] });
    const r = await leer();
    expect(r.status).toBe(200);
    const datos = (await r.json()) as RespuestaRondas;
    expect(datos.faltantes).toEqual({ catalogo: true, metricas: false });
    expect(datos.rondas).toHaveLength(1);
    expect(datos.rondas[0].corridas).toHaveLength(1);
    expect(datos.avisos.join("\n")).toMatch(/rondas\.json no es un JSON válido/);
    expect(datos.avisos.join("\n")).toMatch(/1 ronda\(s\) mal formada/);
    expect(datos.avisos.join("\n")).toMatch(/1 corrida\(s\) mal formada/);
  });

  it("grupos: cada ronda en uno solo; las sueltas forman el suyo; avisos por grupo repetido, inexistente o mezclado", async () => {
    catalogo({
      version: 2,
      grupos: [
        { rondas: [44, 43, 45], titulo: "Comparar los cinco modelos" },
        { rondas: [45, 46] },
        { rondas: [56, 57] },
        { rondas: [99] },
        { titulo: "sin rondas" },
      ],
      rondas: [
        { ronda: 43, titulo: "Comparar (1)", etapa: "comparativa" },
        { ronda: 44, titulo: "Comparar (2)", etapa: "comparativa" },
        { ronda: 45, titulo: "Comparar (3)", etapa: "comparativa" },
        { ronda: 46, titulo: "DeepSeek sin razonamiento viejo", etapa: "deepseek" },
        { ronda: 56, titulo: "Dos pasos", etapa: "comparativa" },
        { ronda: 57, titulo: "Reglas corregidas", etapa: "comparativa" },
        { ronda: 59, titulo: "Cierre", etapa: "comparativa" },
      ],
    });
    metricas({ rondas: [{ ronda: 44, corridas: [{ ...CORRIDA, repeticion: 2 }, CORRIDA, { ...CORRIDA, repeticion: "dos" }] }] });
    const datos = (await (await leer()).json()) as RespuestaRondas;
    expect(datos.grupos).toEqual([
      { id: "r43-45", rondas: [43, 44, 45], titulo: "Comparar los cinco modelos", agrupada: true },
      { id: "r46", rondas: [46], titulo: "DeepSeek sin razonamiento viejo", agrupada: false },
      { id: "r56-57", rondas: [56, 57], titulo: "Dos pasos", agrupada: true },
      { id: "r59", rondas: [59], titulo: "Cierre", agrupada: false },
    ]);
    expect(datos.rondas.map((r) => [r.ronda, r.grupo])).toEqual([
      [43, "r43-45"],
      [44, "r43-45"],
      [45, "r43-45"],
      [46, "r46"],
      [56, "r56-57"],
      [57, "r56-57"],
      [59, "r59"],
    ]);
    // Las repeticiones van en orden; una repetición ilegible cuenta como la primera.
    expect(datos.rondas[1].corridas.map((c) => c.repeticion)).toEqual([1, 1, 2]);
    const avisos = datos.avisos.join("\n");
    expect(avisos).toMatch(/la ronda 45 está en dos grupos; se queda en r43-45/);
    expect(avisos).toMatch(/cita la ronda 99, que no está/);
    expect(avisos).toMatch(/el grupo r56-57 mezcla catálogos de severidad/);
    expect(avisos).not.toMatch(/r56-57 mezcla etapas/);
    expect(avisos).toMatch(/1 grupo\(s\) mal formado/);
  });

  it("el catálogo real arma sus grupos sin avisos", async () => {
    process.env.RONDAS_CATALOGO = join(process.cwd(), "..", "docs", "demo", "rondas.json");
    const datos = (await (await leer()).json()) as RespuestaRondas;
    expect(datos.avisos).toEqual([]);
    expect(datos.grupos.find((g) => g.id === "r43-45")).toMatchObject({ rondas: [43, 44, 45], agrupada: true });
    expect(datos.grupos.find((g) => g.rondas.includes(59))).toMatchObject({ id: "r59", agrupada: false });
  });

  it("catálogo sin grupos (versión 1): cada ronda es su propio grupo, sin avisos", async () => {
    catalogo({ rondas: [{ ronda: 1, titulo: "a" }, { ronda: 2, titulo: "b" }] });
    const datos = (await (await leer()).json()) as RespuestaRondas;
    expect(datos.grupos.map((g) => g.id)).toEqual(["r1", "r2"]);
    expect(datos.avisos).toEqual([]);
  });

  it("métricas sin la lista de rondas: faltantes, no 500; una etapa desconocida queda en null", async () => {
    metricas({ version: 1, corridas: [] });
    catalogo({ rondas: [{ ronda: 1, etapa: "otra-cosa", titulo: "x" }] });
    const datos = (await (await leer()).json()) as RespuestaRondas;
    expect(datos.faltantes).toEqual({ catalogo: false, metricas: true });
    expect(datos.avisos.join("\n")).toMatch(/no tiene la forma esperada/);
    expect(datos.rondas[0]).toMatchObject({ ronda: 1, etapa: null, documentada: true });
  });
});

describe("POST /api/rondas/recalcular", () => {
  it("sin sesión responde 401", async () => {
    expect((await recalcular({})).status).toBe(401);
  });

  it("corre el script y devuelve el resumen con las métricas nuevas", async () => {
    scriptFalso();
    const r = await recalcular();
    expect(r.status).toBe(200);
    // Paso 2: la estabilidad. «pck-1» no es un PreCheck que exista, así que no se puede leer; el paso no falla.
    expect(await r.json()).toMatchObject({ generado: "2026-10-13T12:00:00Z", rondas: 1, corridas: 2, salida: "1 ronda, 2 corridas", estabilidad: { planos: 0, sinLeer: 2 } });
    const datos = (await (await leer()).json()) as RespuestaRondas;
    expect(datos.rondas[0].corridas).toHaveLength(2);
    expect(datos.estabilidad).toMatchObject({ planos: [], sinLeer: 2 });
  });

  it("si la estabilidad no se puede guardar, las métricas quedan y la respuesta lleva un aviso", async () => {
    scriptFalso();
    // Un directorio donde va el archivo: no se puede escribir.
    mkdirSync(join(dir, "estabilidad.json"));
    const r = await recalcular();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ corridas: 2, estabilidad: null, aviso: expect.stringContaining("no la estabilidad entre corridas") });
  });

  it("si el script falla responde 500 con su mensaje", async () => {
    scriptFalso({ falla: true });
    const r = await recalcular();
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ code: "rondas.fallo", message: expect.stringContaining("no se encontró la verdad") });
  });

  it("una a la vez: mientras corre, otra petición responde 409", async () => {
    scriptFalso({ esperaMs: 300 });
    const [a, b] = await Promise.all([recalcular(), recalcular()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await (a.status === 409 ? a : b).json()).toMatchObject({ code: "rondas.en_curso" });
  });
});
