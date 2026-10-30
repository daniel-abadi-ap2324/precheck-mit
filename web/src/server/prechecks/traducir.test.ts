// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { costoDelRegistro } from "./traducir";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "traducir-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("costo de la revisión desde ia.log.jsonl", () => {
  it("toma total_cost_usd de la última línea «result», con líneas cortadas o de otro tipo en medio", async () => {
    const ruta = join(dir, "ia.log.jsonl");
    writeFileSync(ruta, ['{"type":"assistant","text":"hola"}', '{"type":"result","total_cost_usd":0.41}', '{"type":"result_deepseek","total_cost_usd":0.62,"llamadas":18}', '{"type":"result","total_cost_us'].join("\n"));
    expect(await costoDelRegistro(ruta)).toEqual({ costoUsd: 0.62 });
  });

  it("sin archivo o sin costo devuelve vacío", async () => {
    expect(await costoDelRegistro(join(dir, "no-existe.jsonl"))).toEqual({});
    const ruta = join(dir, "ia.log.jsonl");
    writeFileSync(ruta, '{"type":"assistant"}\n');
    expect(await costoDelRegistro(ruta)).toEqual({});
  });
});
