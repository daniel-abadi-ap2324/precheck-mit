// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { POST } = await import("./route");
const { GET: GET_PRECHECK } = await import("./[id]/route");
const { GET: GET_PROGRESO } = await import("./[id]/progreso/route");
const { PUT: PUT_HECHOS } = await import("../planos/[id]/hechos/route");
const { GET: GET_PLANO } = await import("../planos/[id]/route");
const { esperarMotor } = await import("@/server/prechecks/motor");

const PLAN = "plan-11111111-2222-4333-8444-555555555555";
const conSesion = { cookie: "mp_session=demo-token", "content-type": "application/json" };
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const DATOS = { nombreProyecto: "Prueba", tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021", codigoZona: "RM1" };

let dir: string;

/**
 * Motor falso (PRECHECK_REVISOR): un script de Node con la misma interfaz que precheck.planos.revisar. Copia el área
 * del lote de la extracción a hechos.json para comprobar que la corrección del usuario llega al motor.
 */
function motorFalso(falla = false) {
  const script = join(dir, "revisor.mjs");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
     const a = process.argv.slice(2); const v = (k) => a[a.indexOf(k) + 1];
     if (${falla}) { console.error("fallo"); process.exit(1); }
     const ext = JSON.parse(readFileSync(v("--extraccion"), "utf8"));
     const area = ext.hechos.find((h) => h.hecho === "lote.area_m2");
     const lote = JSON.parse(readFileSync(v("--lote"), "utf8"));
     writeFileSync(v("--salida") + "/hechos.json", JSON.stringify({ lote: { area_m2: { valor: area.valor, confianza: area.confianza, fuente: area.fuente } }, tramite: lote.tramite }));
     writeFileSync(v("--salida") + "/resultado.json", JSON.stringify({ norma_aplicable: lote.lote.norma_aplicable.valor, codigo_zona: "RM1", resultados: [
       { regla_id: "R-1", resultado: "REQUIERE_REVISION", titulo: "Regla de prueba", motivo: "dato faltante", fuente_norma: { norma: "N", articulo: "1", cita_textual: "cita" } }
     ], no_aplican: 3 }));`,
  );
  process.env.PRECHECK_REVISOR = `"${process.execPath}" "${script}"`;
}

function planListo() {
  const carpeta = join(dir, "planos", PLAN);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "estado.json"), JSON.stringify({ status: "ready", fileName: "a.pdf", sizeBytes: 1, updatedAt: "2026-10-01T00:00:00Z" }));
  writeFileSync(
    join(carpeta, "extraccion.json"),
    JSON.stringify({
      formato: "1.0.0",
      documento: "a.pdf",
      sha256: "0",
      paginas: [],
      hechos: [
        { hecho: "lote.area_m2", valor: null, confianza: 0, estado: "no_encontrado", fuente: null },
        { hecho: "lote.finca", valor: "071091", confianza: 0.9, estado: "ok", fuente: { metodo: "pdf_texto", pagina: 1, bbox: [0, 0, 1, 1] } },
      ],
      escalas: [],
      requisitos_anexo_iv: [],
    }),
  );
  writeFileSync(join(carpeta, "p1.png"), "png");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prechecks-api-"));
  process.env.PLANOS_DIR = join(dir, "planos");
  process.env.PRECHECKS_DIR = join(dir, "prechecks");
  motorFalso();
  planListo();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_REVISOR;
});

const corregir = (cuerpo: unknown, headers: Record<string, string> = conSesion) =>
  PUT_HECHOS(new Request(`http://localhost/api/planos/${PLAN}/hechos`, { method: "PUT", headers, body: JSON.stringify(cuerpo) }), ctx({ id: PLAN }));
/** Paso 1: la finca confirmada tal como se leyó y el área corregida (la zona va en DATOS.codigoZona). */
const confirmarBasicos = () => corregir({ "lote.finca": { confirmar: true }, "lote.area_m2": 850.5 });
const iniciar = (cuerpo: unknown) => POST(new Request("http://localhost/api/prechecks", { method: "POST", headers: conSesion, body: JSON.stringify(cuerpo) }));

describe("PUT /api/planos/[id]/hechos", () => {
  it("sin sesión responde 401", async () => {
    expect((await corregir({ "lote.area_m2": 1 }, {})).status).toBe(401);
  });

  it("solo acepta datos que usa el PreCheck y valores válidos", async () => {
    expect(await (await corregir({ "../etc": 1 })).json()).toMatchObject({ code: "plano.dato_invalido" });
    expect(await (await corregir({ "lote.area_m2": { x: 1 } })).json()).toMatchObject({ code: "plano.valor_invalido" });
  });

  it("guarda la corrección aparte y el plano la devuelve con procedencia «humano»; null la deshace", async () => {
    expect((await corregir({ "lote.area_m2": 850.5, "proyecto.altura_m": 12 })).status).toBe(200);
    const plano = await (await GET_PLANO(new Request("http://localhost"), ctx({ id: PLAN }))).json();
    const area = plano.extraccion.hechos.find((h: { hecho: string }) => h.hecho === "lote.area_m2");
    expect(area).toMatchObject({ valor: 850.5, estado: "ok", confianza: 1, corregido: true, valorOriginal: null, fuente: { metodo: "humano" } });
    expect(plano.extraccion.hechos.some((h: { hecho: string }) => h.hecho === "proyecto.altura_m")).toBe(true);
    // La extracción original no cambia.
    expect(readFileSync(join(dir, "planos", PLAN, "extraccion.json"), "utf8")).toContain('"valor":null');
    await corregir({ "proyecto.altura_m": null });
    const despues = await (await GET_PLANO(new Request("http://localhost"), ctx({ id: PLAN }))).json();
    expect(despues.extraccion.hechos.some((h: { hecho: string }) => h.hecho === "proyecto.altura_m")).toBe(false);
  });

  it("confirma un dato sin cambiarlo: procedencia «humano», confianza 1 y el valor leído; null deshace la confirmación", async () => {
    expect((await corregir({ "lote.finca": { confirmar: true } })).status).toBe(200);
    expect(JSON.parse(readFileSync(join(dir, "planos", PLAN, "correcciones.json"), "utf8"))["lote.finca"]).toMatchObject({ confirmado: true });
    const plano = await (await GET_PLANO(new Request("http://localhost"), ctx({ id: PLAN }))).json();
    const finca = plano.extraccion.hechos.find((h: { hecho: string }) => h.hecho === "lote.finca");
    expect(finca).toMatchObject({ valor: "071091", confianza: 1, estado: "ok", confirmado: true, fuente: { metodo: "humano", pagina: 1 } });
    expect(finca.corregido).toBeUndefined();
    await corregir({ "lote.finca": null });
    const despues = await (await GET_PLANO(new Request("http://localhost"), ctx({ id: PLAN }))).json();
    expect(despues.extraccion.hechos.find((h: { hecho: string }) => h.hecho === "lote.finca")).toMatchObject({ confianza: 0.9, fuente: { metodo: "pdf_texto" } });
  });

  it("no confirma lo que el lector no leyó con certeza (hay que corregirlo) ni objetos que no son «confirmar»", async () => {
    const r = await corregir({ "lote.area_m2": { confirmar: true } });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "plano.no_confirmable" });
    expect(await (await corregir({ "lote.finca": { confirmar: false } })).json()).toMatchObject({ code: "plano.valor_invalido" });
    expect(await (await corregir({ "lote.finca": { confirmar: true, valor: 1 } })).json()).toMatchObject({ code: "plano.valor_invalido" });
  });

  it("corregir un dato confirmado reemplaza la confirmación", async () => {
    await corregir({ "lote.finca": { confirmar: true } });
    await corregir({ "lote.finca": "071122" });
    const plano = await (await GET_PLANO(new Request("http://localhost"), ctx({ id: PLAN }))).json();
    expect(plano.extraccion.hechos.find((h: { hecho: string }) => h.hecho === "lote.finca")).toMatchObject({ valor: "071122", corregido: true, valorOriginal: "071091" });
  });

  it("no corrige un plano que todavía se está leyendo", async () => {
    writeFileSync(join(dir, "planos", PLAN, "estado.json"), JSON.stringify({ status: "processing", fileName: "a.pdf", sizeBytes: 1, updatedAt: "x" }));
    expect((await corregir({ "lote.area_m2": 1 })).status).toBe(409);
  });
});

describe("POST /api/prechecks", () => {
  it("pide planos y una norma conocida", async () => {
    expect(await (await iniciar({ projectId: "prj-1", planIds: [], datos: DATOS })).json()).toMatchObject({ code: "precheck.sin_planos" });
    expect(await (await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: { ...DATOS, normaAplicable: "INVENTADA" } })).json()).toMatchObject({
      code: "precheck.datos_invalidos",
    });
    expect(await (await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: { ...DATOS, fechaPresentacion: "ayer" } })).json()).toMatchObject({
      code: "precheck.datos_invalidos",
    });
  });

  it("no ejecuta (409) sin finca, área y zona confirmadas o corregidas, y dice qué falta", async () => {
    const r = await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: { ...DATOS, codigoZona: "" } });
    expect(r.status).toBe(409);
    const cuerpo = await r.json();
    expect(cuerpo.code).toBe("precheck.datos_sin_confirmar");
    expect(cuerpo.message).toContain("el área del lote y la zona");
    await corregir({ "lote.finca": { confirmar: true } });
    expect((await (await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: DATOS })).json()).message).toMatch(/el área del lote\./);
    await corregir({ "lote.area_m2": 850.5 });
    // La zona vale confirmada en el plano o indicada como código de zona.
    expect((await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: DATOS })).status).toBe(202);
    await corregir({ "plano.zonificacion_declarada": "RM1" });
    expect((await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: { ...DATOS, codigoZona: "" } })).status).toBe(202);
    await esperarMotor();
  });

  it("valida el cuadro de datos y lo escribe en lote.json como «declarado»", async () => {
    await confirmarBasicos();
    const malo = await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: { ...DATOS, datosDeclarados: { "proyecto.ocupacion_pct": 120 } } });
    expect(malo.status).toBe(400);
    expect((await malo.json()).message).toMatch(/Ocupación: no puede pasar de 100/);
    const r = await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: { ...DATOS, datosDeclarados: { "proyecto.retiro_posterior_m": 2.5, "acceso_vehicular.rotura_cordon_m": 6 } } });
    expect(r.status).toBe(202);
    const { precheckId } = await r.json();
    await esperarMotor();
    const lote = JSON.parse(readFileSync(join(dir, "prechecks", precheckId, "lote.json"), "utf8"));
    expect(lote.proyecto.retiro_posterior_m).toEqual({ valor: 2.5, confianza: 1, fuente: { metodo: "declarado", detalle: "declarado por el usuario en el cuadro de datos" } });
    expect(lote.acceso_vehicular.rotura_cordon_m.valor).toBe(6);
  });

  it("corre el motor con la extracción corregida y devuelve el PreCheck traducido con los ids del proyecto web", async () => {
    await confirmarBasicos();
    const r = await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: DATOS });
    expect(r.status).toBe(202);
    const { precheckId } = await r.json();
    expect(precheckId).toMatch(/^pck-/);
    await esperarMotor();

    const progreso = await (await GET_PROGRESO(new Request("http://localhost", { headers: conSesion }), ctx({ id: precheckId }))).json();
    expect(progreso).toEqual({ stage: "done", percent: 100, ruleIndex: 1, ruleTotal: 1 });

    const datos = await (await GET_PRECHECK(new Request("http://localhost", { headers: conSesion }), ctx({ id: precheckId }))).json();
    expect(datos.precheck).toMatchObject({ id: precheckId, projectId: "prj-1", status: "completed" });
    expect(datos.precheck.results).toEqual([expect.objectContaining({ ruleId: "R-1", status: "MANUAL_REVIEW", official: false })]);
    expect(datos.project).toMatchObject({ id: "prj-1", name: "Prueba", precheckId, zoningCode: "RM1" });

    const run = join(dir, "prechecks", precheckId);
    const hechos = JSON.parse(readFileSync(join(run, "hechos.json"), "utf8"));
    expect(hechos.lote.area_m2).toMatchObject({ valor: 850.5, confianza: 1, fuente: { metodo: "humano" } });
    const lote = JSON.parse(readFileSync(join(run, "lote.json"), "utf8"));
    expect(lote.lote.norma_aplicable.valor).toBe("PLOT-A61-2021");
    expect(existsSync(join(run, "p1.png"))).toBe(true);
  });

  it("si el motor falla, el PreCheck queda «falló» con un mensaje para el usuario", async () => {
    motorFalso(true);
    await confirmarBasicos();
    const { precheckId } = await (await iniciar({ projectId: "prj-1", planIds: [PLAN], datos: DATOS })).json();
    await esperarMotor();
    const r = await GET_PRECHECK(new Request("http://localhost", { headers: conSesion }), ctx({ id: precheckId }));
    expect(r.status).toBe(422);
    expect((await r.json()).message).toMatch(/motor de reglas no pudo evaluar/);
  });

  it("ids ajenos responden 404", async () => {
    expect((await GET_PRECHECK(new Request("http://localhost", { headers: conSesion }), ctx({ id: "../../etc" }))).status).toBe(404);
  });
});
