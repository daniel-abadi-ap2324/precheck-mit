// @vitest-environment node
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { enGrupos, instruccionesMaestro, leerPedidoXtra, prepararCarpetaEmpleado } from "./xtra";

let dir = "";
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("revisión XTRA", () => {
  it("acepta de 1 a 10 empleados con modelo; lo demás no", () => {
    expect(leerPedidoXtra({ empleados: 3, modeloEmpleados: "claude-sonnet-5-5" })).toEqual({ empleados: 3, modeloEmpleados: "claude-sonnet-5-5" });
    expect(leerPedidoXtra({ empleados: 0, modeloEmpleados: "x" })).toBeNull();
    expect(leerPedidoXtra({ empleados: 11, modeloEmpleados: "x" })).toBeNull();
    expect(leerPedidoXtra({ empleados: 2.5, modeloEmpleados: "x" })).toBeNull();
    expect(leerPedidoXtra({ empleados: 2 })).toBeNull();
    expect(leerPedidoXtra("xtra")).toBeNull();
  });

  it("la carpeta del empleado copia las entradas, no el estado, los registros ni el dictamen", async () => {
    dir = await mkdtemp(join(tmpdir(), "xtra-"));
    for (const n of ["lote.json", "extraccion.json", "p1.png", "estado.json", "dictamen.json", "ia.log.txt", "definidas.json"]) await writeFile(join(dir, n), "{}");
    await mkdir(join(dir, "tmp"));
    const destino = await prepararCarpetaEmpleado(dir, 2);
    expect(destino).toBe(join(dir, "xtra", "empleado-2"));
    expect((await readdir(destino)).sort()).toEqual(["definidas.json", "extraccion.json", "lote.json", "p1.png"]);
  });

  it("enGrupos respeta el máximo a la vez y no corta si una tarea falla", async () => {
    let corriendo = 0;
    let pico = 0;
    const tarea = (i: number) => async () => {
      corriendo++;
      pico = Math.max(pico, corriendo);
      await new Promise((r) => setTimeout(r, 5));
      corriendo--;
      if (i === 1) throw new Error("falla");
      return i;
    };
    const r = await enGrupos([0, 1, 2, 3, 4].map(tarea), 2);
    expect(pico).toBe(2);
    expect(r.map((x) => x.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
  });

  it("el maestro recibe las carpetas de los empleados que terminaron y la excepción a la independencia", () => {
    const t = instruccionesMaestro("/caso", [1, 3], 3).join("\n");
    expect(t).toMatch(/AGENTE MAESTRO/);
    expect(t).toMatch(/3 agentes empleados .* 2 terminaron/);
    expect(t).toContain("empleado-1");
    expect(t).toContain("empleado-3");
    expect(t).not.toContain("empleado-2");
    expect(t).toMatch(/no votes a ciegas/);
  });
});
