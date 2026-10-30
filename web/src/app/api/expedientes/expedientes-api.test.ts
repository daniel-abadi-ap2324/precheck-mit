// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DICTAMEN_SINTETICO, RESULTADO_CON_ZONA, RESULTADO_SINTETICO } from "@/test/expediente-sintetico";
import { GET as LISTA } from "./route";
import { GET as DETALLE } from "./[id]/route";

let dir: string;
const conSesion = { cookie: "mp_session=demo-token" };
const pedir = (url: string, headers: Record<string, string> = conSesion) => new Request(`http://localhost${url}`, { headers });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function expediente(nombre: string, archivos: Record<string, string>) {
  mkdirSync(join(dir, nombre));
  for (const [a, contenido] of Object.entries(archivos)) writeFileSync(join(dir, nombre, a), contenido);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "expedientes-api-"));
  process.env.PRECHECK_EXPEDIENTES = dir;
  expediente("Pueblo Ficticio  -  RLA-0000-1", {
    "resultado.json": JSON.stringify(RESULTADO_SINTETICO),
    "informe.md": "# Informe\n\nTexto con <script>alert(1)</script>.",
  });
  expediente("Otro Lugar - RDP-0000-2", { "resultado.json": JSON.stringify({ ...RESULTADO_SINTETICO, codigo_zona: "RM1" }) });
  expediente("Dañado - RLA-0000-3", { "resultado.json": "{ esto no es json" });
  expediente("Sin resultado", { "notas.txt": "vacío" });
  writeFileSync(join(dir, "suelto.json"), "{}");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_EXPEDIENTES;
});

describe("GET /api/expedientes", () => {
  it("sin sesión responde 401", async () => {
    const r = await LISTA(pedir("/api/expedientes", {}));
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: "auth.sin_sesion" });
  });

  it("lista un proyecto por carpeta con resultado.json legible; omite las dañadas y las que no lo tienen", async () => {
    const r = await LISTA(pedir("/api/expedientes"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    const { items } = await r.json();
    expect(items.map((p: { id: string }) => p.id)).toEqual(["exp-otro-lugar-rdp-0000-2", "exp-pueblo-ficticio-rla-0000-1"]);
    expect(items[1]).toMatchObject({ name: "Pueblo Ficticio · RLA-0000-1", origen: "expediente", status: "REVIEW_REQUIRED", zoningCode: "R3" });
    // La lista no lleva los resultados por regla.
    expect(items[1].results).toBeUndefined();
  });

  it("con la carpeta inexistente responde una lista vacía", async () => {
    process.env.PRECHECK_EXPEDIENTES = join(dir, "no-existe");
    expect(await (await LISTA(pedir("/api/expedientes"))).json()).toEqual({ items: [] });
  });
});

describe("GET /api/expedientes/[id]", () => {
  it("devuelve el proyecto, el PreCheck con sus reglas y el informe del revisor como texto", async () => {
    const r = await DETALLE(pedir("/api/expedientes/exp-pueblo-ficticio-rla-0000-1"), ctx("exp-pueblo-ficticio-rla-0000-1"));
    expect(r.status).toBe(200);
    const { project, precheck } = await r.json();
    expect(project.id).toBe("exp-pueblo-ficticio-rla-0000-1");
    expect(precheck.id).toBe("pc-exp-pueblo-ficticio-rla-0000-1");
    expect(precheck.results).toHaveLength(RESULTADO_SINTETICO.resultados.length);
    expect(precheck.rules[0]).toMatchObject({ id: "AC-R3-RETIRO-FRONTAL", title: "R3: retiro frontal" });
    expect(precheck.informeRevisor).toContain("<script>");
  });

  it("sin sesión responde 401", async () => {
    expect((await DETALLE(pedir("/api/expedientes/exp-pueblo-ficticio-rla-0000-1", {}), ctx("exp-pueblo-ficticio-rla-0000-1"))).status).toBe(401);
  });

  it.each(["exp-no-existe", "..", "exp-../../etc", "exp-danado-rla-0000-3", "Pueblo Ficticio  -  RLA-0000-1", "exp-sin-resultado", "%2e%2e"])(
    "responde 404 con un id que no está en el listado (%s)",
    async (id) => {
      const r = await DETALLE(pedir(`/api/expedientes/${encodeURIComponent(id)}`), ctx(id));
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ code: "expediente.inexistente", message: "El expediente no existe." });
    },
  );
});

describe("GET /api/expedientes/[id] con dictamen.json", () => {
  const leer = async (id: string) => (await DETALLE(pedir(`/api/expedientes/${id}`), ctx(id))).json();

  it("aplica el dictamen del arquitecto revisor y no expone los avisos en la respuesta", async () => {
    expediente("Con Dictamen - RLA-0000-4", { "resultado.json": JSON.stringify(RESULTADO_CON_ZONA), "dictamen.json": JSON.stringify(DICTAMEN_SINTETICO) });
    const cuerpo = await leer("exp-con-dictamen-rla-0000-4");
    expect(cuerpo.avisos).toBeUndefined();
    expect(cuerpo.precheck.fuenteResultado).toBe("Dictamen del arquitecto revisor (agente revisor-planos)");
    expect(cuerpo.project.expediente.dictamen.conclusion).toContain("curvas de nivel");
    expect(cuerpo.precheck.results.find((r: { ruleId: string }) => r.ruleId === "A110-AIV-CURVAS-NIVEL")).toMatchObject({ status: "FAIL", motorStatus: "MANUAL_REVIEW" });
  });

  it("un dictamen.json que no es JSON se ignora con un aviso en el registro; el expediente sigue con el motor", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expediente("Dictamen Roto - RLA-0000-5", { "resultado.json": JSON.stringify(RESULTADO_SINTETICO), "dictamen.json": "{ no es json" });
    const cuerpo = await leer("exp-dictamen-roto-rla-0000-5");
    expect(cuerpo.project.expediente.dictamen).toBeNull();
    expect(cuerpo.precheck.results).toHaveLength(RESULTADO_SINTETICO.resultados.length);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("dictamen.json no es JSON válido"));
    aviso.mockRestore();
  });
});
