// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErrorRevision, escribirRevision, leerRevision, MAX_NOTA, validarCambios } from "./revision";

const ID = "pck-11111111-2222-4333-8444-555555555555";
let dir: string;
const carpeta = () => join(dir, ID);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "revision-"));
  process.env.PRECHECKS_DIR = dir;
  mkdirSync(carpeta(), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECKS_DIR;
});

describe("revision.json", () => {
  it("sin archivo, la revisión está vacía", async () => {
    expect(await leerRevision(ID)).toEqual({ version: 1, decisiones: {} });
  });

  it("guarda con la fecha del servidor, fusiona por regla y no deja temporales", async () => {
    const t1 = new Date("2026-10-13T15:00:00.000Z");
    await escribirRevision(ID, { decisiones: { "A110-AIV-4": { accion: "confirmar", nota: "visto en A-101" } } }, t1);
    const r = await escribirRevision(ID, { decisiones: { "HALLAZGO-3": { accion: "contradecir" } } }, new Date("2026-10-13T16:00:00.000Z"));
    expect(r.decisiones).toEqual({
      "A110-AIV-4": { accion: "confirmar", nota: "visto en A-101", fecha: "2026-10-13T15:00:00.000Z" },
      "HALLAZGO-3": { accion: "contradecir", nota: "", fecha: "2026-10-13T16:00:00.000Z" },
    });
    expect(await leerRevision(ID)).toEqual(r);
    expect(JSON.parse(readFileSync(join(carpeta(), "revision.json"), "utf8")).version).toBe(1);
    expect(readdirSync(carpeta()).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("dos guardados a la vez del mismo PreCheck no se pisan (cola)", async () => {
    await Promise.all(["R-1", "R-2", "R-3", "R-4"].map((r) => escribirRevision(ID, { decisiones: { [r]: { accion: "confirmar" } } })));
    expect(Object.keys((await leerRevision(ID)).decisiones).sort()).toEqual(["R-1", "R-2", "R-3", "R-4"]);
  });

  it("«pendiente» deshace la respuesta sin borrar la regla del archivo", async () => {
    await escribirRevision(ID, { decisiones: { "R-1": { accion: "confirmar" } } });
    const r = await escribirRevision(ID, { decisiones: { "R-1": { accion: "pendiente", nota: "falta la lámina de cortes" } } });
    expect(r.decisiones["R-1"]).toMatchObject({ accion: "pendiente", nota: "falta la lámina de cortes" });
  });

  it("un archivo dañado es un error y no se sobrescribe", async () => {
    writeFileSync(join(carpeta(), "revision.json"), "{no es json");
    await expect(leerRevision(ID)).rejects.toBeInstanceOf(ErrorRevision);
    await expect(escribirRevision(ID, { decisiones: { "R-1": { accion: "confirmar" } } })).rejects.toBeInstanceOf(ErrorRevision);
    expect(readFileSync(join(carpeta(), "revision.json"), "utf8")).toBe("{no es json");
    writeFileSync(join(carpeta(), "revision.json"), JSON.stringify({ version: 2, decisiones: {} }));
    await expect(leerRevision(ID)).rejects.toBeInstanceOf(ErrorRevision);
  });

  it("rechaza ids de PreCheck que no son pck-<uuid>", async () => {
    await expect(leerRevision("../x")).rejects.toThrow(/no válido/);
    expect(() => escribirRevision("pck-../../x", { decisiones: { "R-1": { accion: "confirmar" } } })).toThrow(/no válido/);
  });
});

describe("validarCambios", () => {
  it("acepta acción y nota opcional (recortada)", () => {
    expect(validarCambios({ decisiones: { "R-1": { accion: "confirmar", nota: "  ok  " } } })).toEqual({ cambios: { decisiones: { "R-1": { accion: "confirmar", nota: "ok" } } } });
  });

  it.each([
    ["cuerpo vacío", null],
    ["sin reglas", { decisiones: {} }],
    ["acción desconocida", { decisiones: { "R-1": { accion: "aprobar" } } }],
    ["regla con ..", { decisiones: { "R..1": { accion: "confirmar" } } }],
    ["regla con separador", { decisiones: { "../estado": { accion: "confirmar" } } }],
    ["regla con barra", { decisiones: { "a/b": { accion: "confirmar" } } }],
    ["fecha del cliente", { decisiones: { "R-1": { accion: "confirmar", fecha: "2020-01-01T00:00:00Z" } } }],
    ["nota larga", { decisiones: { "R-1": { accion: "confirmar", nota: "x".repeat(MAX_NOTA + 1) } } }],
  ])("rechaza %s", (_caso, cuerpo) => {
    expect(validarCambios(cuerpo)).toHaveProperty("mensaje");
  });
});
