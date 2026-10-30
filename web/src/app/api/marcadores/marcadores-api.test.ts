// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const LISTA = await import("./route");
const UNO = await import("./[id]/route");

const conSesion = { cookie: "mp_session=demo-token", "content-type": "application/json" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const FOTO = {
  proyecto: "Tocumen (comercial) - prueba 77 con Opus 5.5",
  plano: "Tocumen (comercial)",
  modelo: "Opus 5.5",
  ronda: 77,
  repeticion: 1,
  regla: { titulo: "Retiro posterior", estado: "FAIL", faltaEnPlano: false, decision: "NO_CUMPLE", justificacion: "El plano acota 1.20 m." },
};
const ENTRADA = { projectId: "prj-web-000000000001", precheckId: "pck-11111111-2222-4333-8444-555555555555", ruleId: "MP-C2-RETIRO#2", tipo: "equivocada", nota: "El retiro es 3 m.", foto: FOTO };
let dir: string;
let archivo: string;

const post = (cuerpo: unknown, cabeceras: Record<string, string> = conSesion) =>
  LISTA.POST(new Request("http://localhost/api/marcadores", { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) }));
const listar = async (q = "") => (await (await LISTA.GET(new Request(`http://localhost/api/marcadores${q}`, { headers: conSesion }))).json()).items;
const patch = (id: string, cuerpo: unknown) => UNO.PATCH(new Request("http://localhost", { method: "PATCH", headers: conSesion, body: JSON.stringify(cuerpo) }), ctx(id));
const borrar = (id: string) => UNO.DELETE(new Request("http://localhost", { method: "DELETE", headers: conSesion }), ctx(id));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marcadores-"));
  archivo = join(dir, "marcadores.json");
  process.env.MARCADORES_ARCHIVO = archivo;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MARCADORES_ARCHIVO;
});

describe("/api/marcadores", () => {
  it("sin sesión responde 401", async () => {
    expect((await LISTA.GET(new Request("http://localhost/api/marcadores"))).status).toBe(401);
    expect((await post(ENTRADA, { "content-type": "application/json" })).status).toBe(401);
  });

  it("sin archivo no hay marcadores", async () => {
    expect(await listar()).toEqual([]);
  });

  it("guarda uno con id de regla «X#2», lo lista y lo filtra por proyecto", async () => {
    const r = await post(ENTRADA);
    expect(r.status).toBe(201);
    const m = await r.json();
    expect(m).toMatchObject({ ruleId: "MP-C2-RETIRO#2", tipo: "equivocada", nota: "El retiro es 3 m." });
    expect(m.id).toMatch(/^mrc-/);
    expect((await listar()).map((x: { id: string }) => x.id)).toEqual([m.id]);
    expect(await listar("?projectId=prj-web-000000000002")).toEqual([]);
    expect(JSON.parse(readFileSync(archivo, "utf8")).version).toBe(1);
  });

  it("volver a guardar la misma regla reemplaza el tipo y la nota (uno por regla)", async () => {
    const a = await (await post(ENTRADA)).json();
    const b = await (await post({ ...ENTRADA, tipo: "interesante", nota: "" })).json();
    expect(b.id).toBe(a.id);
    expect(b.createdAt).toBe(a.createdAt);
    expect(await listar()).toHaveLength(1);
    expect((await listar())[0]).toMatchObject({ tipo: "interesante", nota: "" });
    await post({ ...ENTRADA, ruleId: null, foto: { ...FOTO, regla: null, conclusion: "No se recomienda presentar." } });
    expect(await listar()).toHaveLength(2);
  });

  it("valida tipo, nota, regla y foto", async () => {
    const mensaje = async (cuerpo: unknown) => {
      const r = await post(cuerpo);
      expect(r.status).toBe(400);
      return (await r.json()).message;
    };
    expect(await mensaje({ ...ENTRADA, tipo: "rara" })).toMatch(/interesante/);
    expect(await mensaje({ ...ENTRADA, nota: "x".repeat(501) })).toMatch(/500/);
    expect(await mensaje({ ...ENTRADA, ruleId: "../etc" })).toMatch(/regla/);
    expect(await mensaje({ ...ENTRADA, foto: { ...FOTO, regla: { ...FOTO.regla, justificacion: "x".repeat(401) } } })).toMatch(/revisión/);
    expect(await mensaje({ ...ENTRADA, projectId: "a/b" })).toBeTruthy();
  });

  it("PATCH cambia la nota; PATCH y DELETE de un id que no existe dan 404", async () => {
    const m = await (await post(ENTRADA)).json();
    const r = await patch(m.id, { nota: "Revisado con Daniel" });
    expect(r.status).toBe(200);
    expect((await r.json()).nota).toBe("Revisado con Daniel");
    expect((await patch(m.id, {})).status).toBe(400);
    const otro = "mrc-00000000-0000-4000-8000-000000000000";
    expect((await patch(otro, { nota: "x" })).status).toBe(404);
    expect((await borrar(otro)).status).toBe(404);
    expect((await borrar(m.id)).status).toBe(204);
    expect(await listar()).toEqual([]);
  });

  it("un archivo dañado da 500 y no se sobrescribe", async () => {
    writeFileSync(archivo, "{ esto no es json");
    expect((await LISTA.GET(new Request("http://localhost/api/marcadores", { headers: conSesion }))).status).toBe(500);
    const r = await post(ENTRADA);
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe("marcadores.danado");
    expect(readFileSync(archivo, "utf8")).toBe("{ esto no es json");
  });

  it("dos guardados a la vez quedan los dos", async () => {
    await Promise.all([post(ENTRADA), post({ ...ENTRADA, ruleId: "OTRA-REGLA" })]);
    expect(await listar()).toHaveLength(2);
  });
});
