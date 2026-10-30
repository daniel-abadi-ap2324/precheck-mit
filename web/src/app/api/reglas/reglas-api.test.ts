// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ComplianceRule } from "@/types";
import { GET } from "./route";

let dir: string;
const leer = async () => ((await (await GET()).json()) as { items: ComplianceRule[] }).items;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "reglas-api-"));
  mkdirSync(join(dir, "reglas"));
  mkdirSync(join(dir, "precheck", "reglas"), { recursive: true });
  writeFileSync(join(dir, "precheck", "reglas", "normas.json"), JSON.stringify({ "MIVIOT-EC-R192-2013": { nombre: "El Carmen", prefijos: ["EC-"] } }));
  writeFileSync(join(dir, "reglas", "b.json"), JSON.stringify([{ id: "EC-B-1", titulo: "Regla B", estado_revision: "borrador" }]));
  writeFileSync(join(dir, "reglas", "a.json"), JSON.stringify([{ id: "EC-A-1", titulo: "Regla A" }, 42]));
  writeFileSync(join(dir, "reglas", "roto.json"), "{ no es json");
  writeFileSync(join(dir, "reglas", "notas.txt"), "no es un catálogo");
  process.env.PRECHECK_REGLAS = join(dir, "reglas");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PRECHECK_REGLAS;
});

describe("GET /api/reglas", () => {
  it("lee los .json de PRECHECK_REGLAS en orden, omite los ilegibles y mantiene las reglas incompletas", async () => {
    const r = await GET();
    expect(r.headers.get("cache-control")).toContain("no-store");
    const items = await leer();
    expect(items.map((x) => x.id)).toEqual(["EC-A-1", "SIN-ID-a-2", "EC-B-1"]);
    expect(items[0]).toMatchObject({ normaLabel: "El Carmen", state: "borrador" });
  });

  it("vuelve a leer el catálogo cuando cambia un archivo", async () => {
    expect(await leer()).toHaveLength(3);
    writeFileSync(join(dir, "reglas", "b.json"), JSON.stringify([{ id: "EC-B-1" }, { id: "EC-B-2" }, { id: "EC-B-3" }]));
    expect(await leer()).toHaveLength(5);
  });

  it("sin carpeta responde una lista vacía", async () => {
    process.env.PRECHECK_REGLAS = join(dir, "no-existe");
    expect(await leer()).toEqual([]);
  });

  const real = resolve(process.cwd(), "..", "reglas");
  it.runIf(existsSync(real))("con el catálogo real: todas las reglas aparecen y cada una tiene su norma", async () => {
    process.env.PRECHECK_REGLAS = real;
    const esperadas = readdirSync(real)
      .filter((a) => a.endsWith(".json"))
      .reduce((n, a) => n + (JSON.parse(readFileSync(join(real, a), "utf8")) as unknown[]).length, 0);
    const items = await leer();
    expect(items).toHaveLength(esperadas);
    expect(items.filter((r) => r.normaLabel?.startsWith("Otra norma")).map((r) => r.id)).toEqual([]);
    expect(new Set(items.map((r) => r.id)).size).toBe(items.length);
  });
});
