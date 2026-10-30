// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { regionesFalsas } from "@/test/regiones-falsas";

const { GET, PUT } = await import("./route");
const { POST } = await import("./proponer/route");
const { GET: GET_IMAGEN } = await import("./imagen/[n]/route");
const { escribirEstado, guardarPlano } = await import("@/server/planos/almacen");
const { esperarRegiones } = await import("@/server/planos/regiones");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "regiones-api-"));
  process.env.PLANOS_DIR = join(dir, "planos");
  regionesFalsas(dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_REGIONES;
  delete process.env.REGIONES_MODO;
});

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const conSesion = { cookie: "mp_session=demo-token", "content-type": "application/json" };
const pedir = (metodo: "PUT" | "POST", cuerpo: unknown, headers: Record<string, string> = conSesion) =>
  new Request("http://x", { method: metodo, headers, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

async function planListo() {
  const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
  await escribirEstado(id, { status: "ready" });
  return id;
}

describe("/api/planos/[id]/regiones", () => {
  it("propone (Python simulado), devuelve las regiones y guarda lo editado", async () => {
    const id = await planListo();
    let r = await GET(new Request("http://x"), ctx({ id }));
    expect(await r.json()).toMatchObject({ id, regiones: null, propuesta: { status: "idle" } });

    r = await POST(pedir("POST", { vision: false }), ctx({ id }));
    expect(r.status).toBe(202);
    // Mientras propone, no se puede guardar ni volver a proponer.
    expect((await POST(pedir("POST", {}), ctx({ id }))).status).toBe(409);
    expect((await PUT(pedir("PUT", { regiones: [] }), ctx({ id }))).status).toBe(409);
    await esperarRegiones();

    r = await GET(new Request("http://x"), ctx({ id }));
    const cuerpo = await r.json();
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(cuerpo.propuesta.status).toBe("ready");
    expect(cuerpo.regiones.regiones).toHaveLength(1);
    const [auto] = cuerpo.regiones.regiones;

    r = await PUT(pedir("PUT", { regiones: [{ ...auto, puntos: [[0.2, 0.1], ...auto.puntos.slice(1)] }] }), ctx({ id }));
    expect(r.status).toBe(200);
    expect((await r.json()).regiones.regiones[0]).toMatchObject({ id: auto.id, editada: true, origen: "humano", confianza: 0.7 });
  });

  it("valida el cuerpo: tipo no permitido 400, JSON roto 400, sin sesión 401, id ajeno 404, sin regiones 409", async () => {
    const id = await planListo();
    expect((await PUT(pedir("PUT", { regiones: [] }), ctx({ id }))).status).toBe(409);
    await POST(pedir("POST", ""), ctx({ id }));
    await esperarRegiones();
    const base = (await (await GET(new Request("http://x"), ctx({ id }))).json()).regiones.regiones[0];
    const r = await PUT(pedir("PUT", { regiones: [{ ...base, tipo: "piscina" }] }), ctx({ id }));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "regiones.invalidas", message: expect.stringMatching(/piscina/) });
    expect((await PUT(pedir("PUT", "{roto"), ctx({ id }))).status).toBe(400);
    expect((await PUT(pedir("PUT", { regiones: [] }, {}), ctx({ id }))).status).toBe(401);
    expect((await POST(pedir("POST", { vision: "sí" }), ctx({ id }))).status).toBe(400);
    expect((await GET(new Request("http://x"), ctx({ id: "../../etc" }))).status).toBe(404);
    expect((await POST(pedir("POST", {}), ctx({ id: "plan-00000000-0000-4000-8000-000000000000" }))).status).toBe(404);
  });

  it("no propone sobre un plano que todavía se está leyendo", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    const r = await POST(pedir("POST", {}), ctx({ id }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "plano.no_listo" });
  });
});

describe("GET /api/planos/[id]/regiones/imagen/[n]", () => {
  it("sirve r<N>.png como PNG; un número inválido es 404", async () => {
    const id = await planListo();
    writeFileSync(join(dir, "planos", id, "r1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const r = await GET_IMAGEN(new Request("http://x"), ctx({ id, n: "1" }));
    expect(r.headers.get("content-type")).toBe("image/png");
    for (const n of ["0", "x", "1.png", "../r1", "2"]) expect((await GET_IMAGEN(new Request("http://x"), ctx({ id, n }))).status).toBe(404);
  });

  it("solo la URL con versión (?v=<generado>) se guarda en caché", async () => {
    const id = await planListo();
    writeFileSync(join(dir, "planos", id, "r1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect((await GET_IMAGEN(new Request("http://x"), ctx({ id, n: "1" }))).headers.get("cache-control")).toBe("private, no-cache");
    const versionada = await GET_IMAGEN(new Request("http://x?v=2026-10-09T10%3A00%3A00Z"), ctx({ id, n: "1" }));
    expect(versionada.headers.get("cache-control")).toContain("max-age=86400");
  });
});
