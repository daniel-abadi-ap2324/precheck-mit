// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXTRACCION_SINTETICA, RESULTADO_SINTETICO } from "@/test/expediente-sintetico";
import { GET as PAGINA } from "./[id]/paginas/[n]/route";
import { GET as DOCUMENTO } from "./[id]/documento/route";
import { GET as DETALLE } from "./[id]/route";

let dir: string;
const ID = "exp-pueblo-ficticio-rla-0000-1";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const conSesion = { cookie: "mp_session=demo-token" };
const pedir = (headers: Record<string, string> = conSesion) => new Request("http://localhost/x", { headers });
const pagina = (id: string, n: string, headers?: Record<string, string>) => PAGINA(pedir(headers), { params: Promise.resolve({ id, n }) });
const documento = (id: string, headers?: Record<string, string>) => DOCUMENTO(pedir(headers), { params: Promise.resolve({ id }) });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "expedientes-paginas-"));
  const exp = join(dir, "expedientes", "Pueblo Ficticio  -  RLA-0000-1");
  mkdirSync(exp, { recursive: true });
  writeFileSync(join(exp, "resultado.json"), JSON.stringify(RESULTADO_SINTETICO));
  writeFileSync(join(exp, "extraccion.json"), JSON.stringify(EXTRACCION_SINTETICA));
  writeFileSync(join(exp, "p1.png"), PNG);
  writeFileSync(join(exp, "p2.png"), PNG);
  writeFileSync(join(exp, "hd1.png"), PNG);
  writeFileSync(join(dir, "secreto.png"), PNG);
  symlinkSync(join(dir, "secreto.png"), join(exp, "p9.png"));
  mkdirSync(join(dir, "anteproyectos"));
  writeFileSync(join(dir, "anteproyectos", "Pueblo Ficticio - RLA-0000-1.pdf"), "%PDF-1.7 original");
  process.env.PRECHECK_EXPEDIENTES = join(dir, "expedientes");
  process.env.PLANOS_EJEMPLO_DIR = join(dir, "anteproyectos");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_EXPEDIENTES;
  delete process.env.PLANOS_EJEMPLO_DIR;
});

describe("GET /api/expedientes/[id]/paginas/[n]", () => {
  it("sirve p<n>.png de la carpeta del expediente como PNG privado", async () => {
    const r = await pagina(ID, "1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toContain("private");
    expect(Buffer.from(await r.arrayBuffer())).toEqual(PNG);
  });

  it("sin sesión responde 401", async () => {
    const r = await pagina(ID, "1", {});
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: "auth.sin_sesion" });
  });

  it.each(["exp-no-existe", "..", "exp-../../etc", "Pueblo Ficticio  -  RLA-0000-1", "%2e%2e"])("un id fuera del listado es 404 (%s)", async (id) => {
    expect((await pagina(id, "1")).status).toBe(404);
  });

  it.each(["abc", "1.5", "0", "01", "-1", "1e2", "../p1", "p1", "1.png", "1000", ""])("un n no entero o fuera de rango es 404 (%s)", async (n) => {
    expect((await pagina(ID, n)).status).toBe(404);
  });

  it("una página sin miniatura es 404 y un enlace simbólico no se sigue", async () => {
    expect((await pagina(ID, "3")).status).toBe(404);
    expect((await pagina(ID, "9")).status).toBe(404);
  });
});

describe("GET /api/expedientes/[id]/documento", () => {
  it("sirve el PDF original de la carpeta de anteproyectos, en línea", async () => {
    const r = await documento(ID);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toMatch(/^inline; filename\*=UTF-8''Pueblo%20Ficticio/);
    expect(await r.text()).toBe("%PDF-1.7 original");
  });

  it("sin sesión 401; id inválido o PDF ausente 404", async () => {
    expect((await documento(ID, {})).status).toBe(401);
    expect((await documento("exp-../../etc")).status).toBe(404);
    rmSync(join(dir, "anteproyectos", "Pueblo Ficticio - RLA-0000-1.pdf"));
    expect((await documento(ID)).status).toBe(404);
  });
});

describe("GET /api/expedientes/[id]: datos de la carpeta", () => {
  it("lleva las páginas con miniatura, las hojas de la extracción y si el PDF original está disponible", async () => {
    const { project } = await (await DETALLE(pedir(), { params: Promise.resolve({ id: ID }) })).json();
    // p9.png es un enlace simbólico y hd1.png no es una página: no se listan.
    expect(project.expediente.miniaturas).toEqual([1, 2]);
    expect(project.expediente.documentoDisponible).toBe(true);
    expect(project.expediente.hojas).toEqual([
      { numero: 1, tipo: "vectorial", lamina: "A-101" },
      { numero: 2, tipo: "escaneada", lamina: null },
      { numero: 3, tipo: "escaneada", lamina: null },
    ]);
  });
});
