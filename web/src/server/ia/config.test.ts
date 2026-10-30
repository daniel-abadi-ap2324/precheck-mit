// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { esModeloDe, leerConfig, mensajeModeloAjeno, modeloPorDefecto, modelosDe, MODELOS, proveedorDelModelo } from "./config";

const ids = (p: Parameters<typeof modelosDe>[0]) => modelosDe(p).map((m) => m.id);
const CLAUDE = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"];

describe("modelosDe: cada proveedor solo ofrece sus modelos", () => {
  it("Claude Code y la API de Anthropic ofrecen los modelos Claude, nunca DeepSeek", () => {
    expect(ids("claude-code")).toEqual(CLAUDE);
    expect(ids("anthropic-api")).toEqual(CLAUDE);
  });

  it("DeepSeek solo ofrece deepseek-flash", () => {
    expect(ids("deepseek-api")).toEqual(["deepseek-flash"]);
  });

  it("con la IA apagada valen todos (el modelo no se usa y se conserva)", () => {
    expect(ids("ninguno")).toEqual(MODELOS.map((m) => m.id));
  });

  it("proveedorDelModelo: el configurado si sirve el modelo; si no, el que lo sirva (para encolar DeepSeek y Claude a la vez)", () => {
    expect(proveedorDelModelo("claude-opus-5-5", "claude-code")).toBe("claude-code");
    expect(proveedorDelModelo("claude-opus-5-5", "anthropic-api")).toBe("anthropic-api");
    expect(proveedorDelModelo("claude-opus-5-5", "deepseek-api")).toBe("claude-code");
    expect(proveedorDelModelo("deepseek-flash", "claude-code")).toBe("deepseek-api");
    expect(proveedorDelModelo("deepseek-flash", "anthropic-api")).toBe("deepseek-api");
    expect(proveedorDelModelo("deepseek-flash", "ninguno")).toBe("ninguno");
  });

  it("el modelo por defecto de cada proveedor es uno de los suyos", () => {
    expect(modeloPorDefecto("claude-code")).toBe("claude-sonnet-5-5");
    expect(modeloPorDefecto("anthropic-api")).toBe("claude-sonnet-5-5");
    expect(modeloPorDefecto("deepseek-api")).toBe("deepseek-flash");
    for (const p of ["claude-code", "anthropic-api", "deepseek-api"] as const) expect(esModeloDe(p, modeloPorDefecto(p))).toBe(true);
  });

  it("esModeloDe rechaza las parejas cruzadas y los modelos inexistentes", () => {
    expect(esModeloDe("deepseek-api", "claude-opus-5-5")).toBe(false);
    expect(esModeloDe("anthropic-api", "deepseek-flash")).toBe(false);
    expect(esModeloDe("claude-code", "gpt-5")).toBe(false);
    expect(esModeloDe("claude-code", "claude-opus-5-5")).toBe(true);
  });

  it("el mensaje de una pareja ajena nombra el proveedor y los modelos que sí valen", () => {
    expect(mensajeModeloAjeno("deepseek-api", "claude-opus-5-5")).toBe("El modelo claude-opus-5-5 no está disponible con DeepSeek. Modelos posibles: deepseek-flash.");
  });
});

describe("leerConfig", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ia-config-"));
    process.env.IA_DIR = dir;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.IA_DIR;
  });

  it("corrige una pareja guardada antes del filtro (DeepSeek con un modelo Claude) al modelo por defecto", async () => {
    writeFileSync(join(dir, "ia.json"), JSON.stringify({ proveedor: "deepseek-api", modelo: "claude-opus-5-5" }));
    expect(await leerConfig()).toEqual({ proveedor: "deepseek-api", modelo: "deepseek-flash", modeloEscaneados: null });
  });

  it("respeta una pareja válida", async () => {
    writeFileSync(join(dir, "ia.json"), JSON.stringify({ proveedor: "anthropic-api", modelo: "claude-opus-5-5" }));
    expect(await leerConfig()).toEqual({ proveedor: "anthropic-api", modelo: "claude-opus-5-5", modeloEscaneados: null });
  });
});
