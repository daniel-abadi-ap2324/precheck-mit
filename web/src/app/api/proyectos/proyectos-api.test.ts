// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PROYECTOS = await import("./route");
const PROYECTO = await import("./[id]/route");
const PRECHECKS = await import("../prechecks/route");
const { esperarMotor } = await import("@/server/prechecks/motor");

const PLAN = "plan-11111111-2222-4333-8444-555555555555";
const conSesion = { cookie: "mp_session=demo-token", "content-type": "application/json" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ENTRADA = { name: "Edificio de prueba", propertyId: "", finca: "07081", address: "Calle 50", corregimiento: "Bella Vista", projectType: "Uso mixto", applicant: "Arq. Prueba", zoningCode: "RM1", parcelId: "DECL-1" };
const LOTE = { id: "DECL-1", finca: "07081", address: "Calle 50", zoningCode: "RM1", geometry: { type: "Polygon", coordinates: [] } };
const DATOS = { nombreProyecto: "Edificio", tramite: "RLA", fechaPresentacion: "2026-09-01", normaAplicable: "PLOT-A61-2021" };
let dir: string;

const crear = async (cuerpo: unknown = { input: ENTRADA, loteDibujado: LOTE }) =>
  PROYECTOS.POST(new Request("http://localhost/api/proyectos", { method: "POST", headers: conSesion, body: JSON.stringify(cuerpo) }));
const leer = async (id: string) => (await PROYECTO.GET(new Request("http://localhost", { headers: conSesion }), ctx(id))).json();
const cambiar = async (id: string, cuerpo: unknown) => PROYECTO.PATCH(new Request("http://localhost", { method: "PATCH", headers: conSesion, body: JSON.stringify(cuerpo) }), ctx(id));

function planEn(status: string) {
  const carpeta = join(dir, "planos", PLAN);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "estado.json"), JSON.stringify({ status, fileName: "a.pdf", sizeBytes: 1, updatedAt: "x" }));
  writeFileSync(join(carpeta, "extraccion.json"), JSON.stringify({ documento: "a.pdf", paginas: [], hechos: [], escalas: [], requisitos_anexo_iv: [] }));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "proyectos-api-"));
  process.env.PROYECTOS_DIR = join(dir, "proyectos");
  process.env.PLANOS_DIR = join(dir, "planos");
  process.env.PRECHECKS_DIR = join(dir, "prechecks");
  const script = join(dir, "revisor.mjs");
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";
     const a = process.argv.slice(2); const salida = a[a.indexOf("--salida") + 1];
     writeFileSync(salida + "/hechos.json", "{}");
     writeFileSync(salida + "/resultado.json", JSON.stringify({ resultados: [{ regla_id: "R-1", resultado: "CUMPLE" }, { regla_id: "R-2", resultado: "REQUIERE_REVISION" }] }));`,
  );
  process.env.PRECHECK_REVISOR = `"${process.execPath}" "${script}"`;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_REVISOR;
});

describe("/api/proyectos", () => {
  it("sin sesión responde 401", async () => {
    expect((await PROYECTOS.GET(new Request("http://localhost/api/proyectos"))).status).toBe(401);
  });

  it("marca como corrida de prueba la que pide lote_ia.py y la que tiene el nombre de una prueba", async () => {
    const pedida = (await (await crear({ input: { ...ENTRADA, esPrueba: true } })).json()).project;
    const porNombre = (await (await crear({ input: { ...ENTRADA, name: "CASO-A - prueba 78 con Opus 5.5 (2)" } })).json()).project;
    const delUsuario = (await (await crear({ input: { ...ENTRADA, esPrueba: "sí" } })).json()).project;
    expect(pedida.esPrueba).toBe(true);
    expect(porNombre.esPrueba).toBe(true);
    expect(delUsuario.esPrueba).toBeUndefined();
  });

  it("crea un proyecto que sobrevive (se lee de disco) con su lote dibujado", async () => {
    const r = await crear();
    expect(r.status).toBe(201);
    const { project } = await r.json();
    expect(project).toMatchObject({ name: "Edificio de prueba", status: "DRAFT", parcelId: "DECL-1" });
    expect(project.id).toMatch(/^prj-web-[0-9a-f]{12}$/);
    expect(await leer(project.id)).toMatchObject({ project: { id: project.id }, loteDibujado: { id: "DECL-1" }, planes: [] });
    const lista = await (await PROYECTOS.GET(new Request("http://localhost/api/proyectos", { headers: conSesion }))).json();
    expect(lista.items.map((p: { project: { id: string } }) => p.project.id)).toEqual([project.id]);
  });

  it("pide un nombre y valida los cambios", async () => {
    expect((await crear({ input: { name: "x" } })).status).toBe(400);
    const { project } = await (await crear()).json();
    expect((await cambiar(project.id, { status: "APROBADO" })).status).toBe(400);
    expect((await cambiar(project.id, { agregarPlan: { id: "../x", format: "PDF" } })).status).toBe(400);
    expect((await cambiar("prj-otro", { status: "DRAFT" })).status).toBe(404);
  });

  it("renombra un proyecto y rechaza nombres inválidos", async () => {
    const { project } = await (await crear()).json();
    const r = await cambiar(project.id, { name: "  Edificio Bella Vista, versión 2  " });
    expect(r.status).toBe(200);
    expect((await r.json()).project.name).toBe("Edificio Bella Vista, versión 2");
    expect((await leer(project.id)).project.name).toBe("Edificio Bella Vista, versión 2");
    for (const name of ["ab", "x".repeat(121), "dos\nlíneas", 7, null]) {
      const mal = await cambiar(project.id, { name });
      expect(mal.status).toBe(400);
      expect(await mal.json()).toMatchObject({ code: "proyecto.nombre_invalido" });
    }
    expect((await leer(project.id)).project.name).toBe("Edificio Bella Vista, versión 2");
  });

  it("anota y quita planos", async () => {
    const { project } = await (await crear()).json();
    await cambiar(project.id, { agregarPlan: { id: PLAN, fileName: "a.pdf", format: "PDF", sizeBytes: 10 } });
    await cambiar(project.id, { agregarPlan: { id: PLAN, fileName: "a.pdf", format: "PDF", sizeBytes: 10 } });
    expect((await leer(project.id)).planes).toEqual([{ id: PLAN, fileName: "a.pdf", format: "PDF", sizeBytes: 10 }]);
    await cambiar(project.id, { quitarPlan: PLAN });
    expect((await leer(project.id)).planes).toEqual([]);
  });

  it("elimina un proyecto de la lista", async () => {
    const { project } = await (await crear()).json();
    const borrar = () => PROYECTO.DELETE(new Request("http://localhost", { method: "DELETE", headers: conSesion }), ctx(project.id));
    expect((await borrar()).status).toBe(204);
    expect((await PROYECTO.GET(new Request("http://localhost", { headers: conSesion }), ctx(project.id))).status).toBe(404);
    expect((await borrar()).status).toBe(404);
  });

  it("el PreCheck deja al proyecto «en revisión» con su precheckId y su índice", async () => {
    const { project } = await (await crear()).json();
    planEn("ready");
    // Sin finca y área confirmadas o corregidas no se ejecuta (paso 1).
    const correcciones = { "lote.finca": { valor: "071091", actualizadoEn: "x" }, "lote.area_m2": { valor: 900, actualizadoEn: "x" }, "plano.zonificacion_declarada": { valor: "RM1", actualizadoEn: "x" } };
    writeFileSync(join(dir, "planos", PLAN, "correcciones.json"), JSON.stringify(correcciones));
    const r = await PRECHECKS.POST(new Request("http://localhost/api/prechecks", { method: "POST", headers: conSesion, body: JSON.stringify({ projectId: project.id, planIds: [PLAN], datos: DATOS }) }));
    const { precheckId } = await r.json();
    expect((await leer(project.id)).project).toMatchObject({ status: "PROCESSING", precheckId });
    await esperarMotor();
    expect((await leer(project.id)).project).toMatchObject({ status: "REVIEW_REQUIRED", precheckId, complianceIndex: 50 });
  });

  it("si el plano todavía se lee, no inicia y lo dice", async () => {
    const { project } = await (await crear()).json();
    planEn("processing");
    const r = await PRECHECKS.POST(new Request("http://localhost/api/prechecks", { method: "POST", headers: conSesion, body: JSON.stringify({ projectId: project.id, planIds: [PLAN], datos: DATOS }) }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "precheck.planos_leyendo" });
  });
});
