// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegistroIa } from "./registro";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "registro-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const leer = (formato: "txt" | "jsonl") => readFileSync(join(dir, `ia.log.${formato}`), "utf8");
const linea = (ev: unknown) => `${JSON.stringify(ev)}\n`;

describe("RegistroIa", () => {
  it("quita las imágenes en base64 de los bloques image y de tool_use_result.file", async () => {
    const r = new RegistroIa("pck-x", dir);
    r.stdout(
      linea({
        type: "user",
        message: { content: [{ type: "tool_result", content: [{ type: "image", source: { type: "base64", data: "A".repeat(5000) } }] }] },
        tool_use_result: { type: "image", file: { base64: "B".repeat(6000), type: "image/jpeg", originalSize: 602892 } },
      }),
    );
    await r.cerrar();
    const jsonl = leer("jsonl");
    expect(jsonl).toContain("[imagen omitida: 5000 caracteres base64]");
    expect(jsonl).toContain("[imagen omitida: 6000 caracteres base64]");
    expect(jsonl).not.toMatch(/AAAAAAAAAA|BBBBBBBBBB/);
    expect(JSON.parse(jsonl).tool_use_result.file.originalSize).toBe(602892);
  });

  it("al llegar al tope deja de anotar al agente, pero escribe el evento final y las líneas del servidor", async () => {
    const r = new RegistroIa("pck-x", dir, 1000);
    r.texto("Revisión con IA: proveedor claude-code, modelo claude-fable-5-1.");
    for (let i = 0; i < 5; i++) r.stdout(linea({ type: "assistant", message: { content: [{ type: "text", text: `paso ${i} ${"x".repeat(400)}` }] } }));
    r.stdout(linea({ type: "result", total_cost_usd: 21.76, num_turns: 13, terminal_reason: "completed" }));
    r.texto("Proceso terminado (código 0).");
    await r.cerrar();
    const jsonl = leer("jsonl").trim().split("\n").map((l) => JSON.parse(l) as { type: string; total_cost_usd?: number });
    expect(jsonl.filter((e) => e.type === "assistant").length).toBeLessThan(5);
    expect(jsonl.at(-1)).toMatchObject({ type: "result", total_cost_usd: 21.76 });
    expect(r.terminal).toBe("completed");
    const txt = leer("txt");
    expect(txt).toContain("Revisión con IA");
    expect(txt.match(/Registro recortado/g)).toHaveLength(1);
    expect(txt).toContain("Proceso terminado (código 0).");
    expect(txt).not.toContain("paso 4");
  });
});
