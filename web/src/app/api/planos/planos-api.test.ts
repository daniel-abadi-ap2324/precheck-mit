// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const encolar = vi.fn();
vi.mock("@/server/planos/procesar", () => ({
  encolarExtraccion: (id: string) => encolar(id),
  // Sin cola real: el estado se lee tal cual (la reanudación tras un reinicio se prueba en planos.test.ts).
  estadoVigente: async (id: string) => (await import("@/server/planos/almacen")).leerEstado(id),
}));

const { POST } = await import("./route");
const { GET: GET_PLANO } = await import("./[id]/route");
const { GET: GET_PAGINA } = await import("./[id]/paginas/[n]/route");
const EJEMPLOS = await import("./ejemplos/route");
const { escribirEstado, guardarPlano } = await import("@/server/planos/almacen");

let dir: string;
let ejemplos: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "planos-api-"));
  ejemplos = join(dir, "ejemplos");
  mkdirSync(ejemplos);
  writeFileSync(join(ejemplos, "Bella Vista - RLA-0000-6.pdf"), "%PDF-1.7 ejemplo");
  writeFileSync(join(ejemplos, "notas.txt"), "no es un plano");
  process.env.PLANOS_DIR = join(dir, "planos");
  process.env.PLANOS_EJEMPLO_DIR = ejemplos;
  encolar.mockClear();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const conSesion = { cookie: "mp_session=demo-token" };
/** Cuerpo multipart armado a mano: el FormData de jsdom no es compatible con el Request de Node. */
function subir(contenido: string, nombre: string, headers: Record<string, string> = conSesion) {
  const b = "----limite";
  const cuerpo = `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${nombre}"\r\nContent-Type: application/pdf\r\n\r\n${contenido}\r\n--${b}--\r\n`;
  return POST(new Request("http://localhost/api/planos", { method: "POST", body: cuerpo, headers: { ...headers, "content-type": `multipart/form-data; boundary=${b}` } }));
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

describe("POST /api/planos", () => {
  it("sin sesión responde 401 (la ruta de carga no pasa por el proxy: verifica la sesión ella misma)", async () => {
    const r = await subir("%PDF-1.7", "a.pdf", {});
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: "auth.sin_sesion" });
  });

  it("rechaza lo que no es un PDF aunque se llame .pdf", async () => {
    const r = await subir("MZ ejecutable", "plano.pdf");
    expect(r.status).toBe(415);
    expect(await r.json()).toEqual({ code: "plano.formato", message: "El archivo no es un PDF válido." });
    expect(encolar).not.toHaveBeenCalled();
  });

  it("guarda el PDF, lo encola para leerlo y responde 202 con su id", async () => {
    const r = await subir("%PDF-1.7 hola", "A-101.pdf");
    expect(r.status).toBe(202);
    const { id, status, fileName } = await r.json();
    expect([status, fileName]).toEqual(["queued", "A-101.pdf"]);
    expect(encolar).toHaveBeenCalledWith(id);
  });
});

describe("GET /api/planos/[id]", () => {
  it("devuelve el estado y, cuando está listo, la extracción; un id ajeno es 404", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    let r = await GET_PLANO(new Request("http://x"), ctx({ id }));
    expect(await r.json()).toMatchObject({ id, status: "queued", extraccion: null });
    writeFileSync(join(process.env.PLANOS_DIR!, id, "extraccion.json"), JSON.stringify({ documento: "a.pdf", paginas: [] }));
    await escribirEstado(id, { status: "ready" });
    r = await GET_PLANO(new Request("http://x"), ctx({ id }));
    expect(await r.json()).toMatchObject({ status: "ready", extraccion: { documento: "a.pdf" } });
    expect((await GET_PLANO(new Request("http://x"), ctx({ id: "../../etc" }))).status).toBe(404);
  });
});

describe("GET /api/planos/[id]/paginas/[n]", () => {
  it("sirve la miniatura como PNG; un número inválido es 404", async () => {
    const id = await guardarPlano(Buffer.from("%PDF-1.7"), "a.pdf");
    writeFileSync(join(process.env.PLANOS_DIR!, id, "p1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const r = await GET_PAGINA(new Request("http://x"), ctx({ id, n: "1" }));
    expect(r.headers.get("content-type")).toBe("image/png");
    for (const n of ["0", "x", "1.png", "../p1"]) expect((await GET_PAGINA(new Request("http://x"), ctx({ id, n }))).status).toBe(404);
  });
});

describe("/api/planos/ejemplos", () => {
  it("lista solo los PDF de la carpeta de ejemplos y encola el elegido; un nombre fuera de la lista es 404", async () => {
    const lista = await (await EJEMPLOS.GET()).json();
    expect(lista).toEqual({ items: [{ nombre: "Bella Vista - RLA-0000-6.pdf", sizeBytes: 16 }] });
    const pedir = (nombre: string) => EJEMPLOS.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ nombre }) }));
    const r = await pedir("Bella Vista - RLA-0000-6.pdf");
    expect(r.status).toBe(202);
    expect(encolar).toHaveBeenCalledOnce();
    for (const malo of ["../../../etc/passwd", "notas.txt", "otro.pdf"]) expect((await pedir(malo)).status).toBe(404);
  });
});
