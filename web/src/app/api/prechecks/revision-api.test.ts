// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { GET, PUT } = await import("./[id]/revision/route");

const ID = "pck-11111111-2222-4333-8444-555555555555";
const OTRO = "pck-99999999-2222-4333-8444-555555555555";
const conSesion = { cookie: "mp_session=demo-token", "content-type": "application/json" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "revision-api-"));
  process.env.PRECHECKS_DIR = dir;
  mkdirSync(join(dir, ID), { recursive: true });
  writeFileSync(join(dir, ID, "estado.json"), JSON.stringify({ status: "done", projectId: "p", planIds: [], datos: {}, createdAt: "", updatedAt: "" }));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECKS_DIR;
});

const leer = (id = ID, headers: Record<string, string> = conSesion) => GET(new Request(`http://localhost/api/prechecks/${id}/revision`, { headers }), ctx(id));
const guardar = (cuerpo: unknown, id = ID, headers: Record<string, string> = conSesion) =>
  PUT(new Request(`http://localhost/api/prechecks/${id}/revision`, { method: "PUT", headers, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) }), ctx(id));

describe("/api/prechecks/[id]/revision", () => {
  it("sin sesión responde 401", async () => {
    expect((await leer(ID, {})).status).toBe(401);
    expect((await guardar({ decisiones: { "R-1": { accion: "confirmar" } } }, ID, { "content-type": "application/json" })).status).toBe(401);
  });

  it("404 si el PreCheck no existe o el id no es pck-<uuid> (nunca rutas con ..)", async () => {
    for (const id of [OTRO, "../x", "pck-../../etc", "exp-pueblo"]) {
      expect((await leer(id)).status).toBe(404);
      expect((await guardar({ decisiones: { "R-1": { accion: "confirmar" } } }, id)).status).toBe(404);
    }
  });

  it("GET sin revisión guardada devuelve la revisión vacía, sin caché", async () => {
    const r = await leer();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(await r.json()).toEqual({ version: 1, decisiones: {} });
  });

  it("PUT guarda con la fecha del servidor y GET la devuelve; otra regla se fusiona", async () => {
    const antes = Date.now();
    const r = await guardar({ decisiones: { "A110-AIV-4": { accion: "contradecir", nota: "el retiro sí está acotado en A-102" } } });
    expect(r.status).toBe(200);
    const guardada = (await r.json()).decisiones["A110-AIV-4"];
    expect(guardada).toMatchObject({ accion: "contradecir", nota: "el retiro sí está acotado en A-102" });
    expect(Date.parse(guardada.fecha)).toBeGreaterThanOrEqual(antes - 1000);
    await guardar({ decisiones: { "HALLAZGO-1": { accion: "confirmar" } } });
    const todo = await (await leer()).json();
    expect(Object.keys(todo.decisiones).sort()).toEqual(["A110-AIV-4", "HALLAZGO-1"]);
    expect(JSON.parse(readFileSync(join(dir, ID, "revision.json"), "utf8"))).toEqual(todo);
  });

  it("400 con cuerpo inválido; no escribe nada", async () => {
    for (const cuerpo of ["{roto", { decisiones: { "R-1": { accion: "aprobar" } } }, { decisiones: { "../estado": { accion: "confirmar" } } }, { accion: "confirmar" }]) {
      const r = await guardar(cuerpo);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ code: "revision.invalida" });
    }
    expect(await (await leer()).json()).toEqual({ version: 1, decisiones: {} });
  });

  it("revision.json dañado: 500 y no lo sobrescribe", async () => {
    writeFileSync(join(dir, ID, "revision.json"), "{no es json");
    expect((await leer()).status).toBe(500);
    expect((await guardar({ decisiones: { "R-1": { accion: "confirmar" } } })).status).toBe(500);
    expect(readFileSync(join(dir, ID, "revision.json"), "utf8")).toBe("{no es json");
  });
});
