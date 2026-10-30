import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { datosParaDeterminar, textoFicha } from "./alcance";
import { type ContextoHerramientas, escribirHecho, ejecutarHerramienta } from "./herramientas-deepseek";

let dir: string;
let reglas: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "alcance-"));
  reglas = await mkdtemp(join(tmpdir(), "reglas-"));
  await writeFile(
    join(reglas, "ml2.json"),
    JSON.stringify([
      { id: "ML2-RAMPA", aplica_si: "lote.norma_aplicable == 'MIVIOT-ML2' and rampa.sentidos == 2" },
      { id: "ML2-OBRA", aplica_si: "proyecto.obra_nueva and rampa.sentidos >= 1" },
    ]),
  );
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(reglas, { recursive: true, force: true });
});

const lista = (errores: string[] = []) => ({
  norma_aplicable: "MIVIOT-ML2",
  codigo_zona: "MP-C2",
  alcance_ia: { presente: true, aplicado: ["lote.norma_aplicable"], errores },
  permisos: [{ id: "PERM-1", tipo: "excepcion", efecto: [{ regla_id: "ML2-RAMPA", accion: "exceptua" }] }],
  total: 12,
  reglas: [],
  sin_determinar: ["ML2-OBRA"],
});

describe("paso 1 (reglas vigentes) en la web", () => {
  it("datosParaDeterminar junta los datos de alcance de las reglas sin determinar, sin la norma ni la zona", async () => {
    const d = await datosParaDeterminar({ sin_determinar: ["ML2-RAMPA", "ML2-OBRA"] }, reglas);
    expect(d).toEqual([
      { clave: "rampa.sentidos", reglas: 2 },
      { clave: "proyecto.obra_nueva", reglas: 1 },
    ]);
  });

  it("la ficha resume normas candidatas, zona y documentos", async () => {
    await writeFile(join(dir, "alcance_base.json"), JSON.stringify({ norma_declarada: "PLOT-A61-2021", normas_candidatas: ["MIVIOT-ML1", "MIVIOT-ML2"], zona: { usuario: "MP-C2", plano: "MP-C2" }, documentos: [{ archivo: "complementario-1.pdf", nombre: "gp_dpu.pdf", tipo_probable: "nota DPU" }] }));
    const t = await textoFicha(dir);
    expect(t).toContain("MIVIOT-ML1, MIVIOT-ML2");
    expect(t).toContain("complementario-1 («gp_dpu.pdf», tipo probable: nota DPU)");
    expect(await textoFicha(join(dir, "no-existe"))).toBe("");
  });

  it("fijar_alcance escribe alcance_ia.json, reevalúa y abre escribir_hecho; los errores vuelven al modelo", async () => {
    let reevaluaciones = 0;
    let actualizadas = 0;
    const ctx: ContextoHerramientas = {
      dir,
      pdf: null,
      clavesPermitidas: new Set(["proyecto.altura_m"]),
      exigirAlcance: true,
      documentos: [{ archivo: "complementario-1.pdf", nombre: "gp_dpu.pdf", ruta: join(dir, "complementario-1.pdf") }],
      reevaluar: async () => {
        reevaluaciones += 1;
        await writeFile(join(dir, "reglas_a_evaluar.json"), JSON.stringify(lista(reevaluaciones === 1 ? ["PERM-1: la cita no aparece en complementario-1, p. 2."] : [])));
        return true;
      },
      actualizarClaves: async () => {
        actualizadas += 1;
      },
    };
    const dato = { clave: "proyecto.altura_m", valor: 12, confianza: 0.9, metodo: "lectura", detalle: "corte A-A", documento: "complementario-1" };
    expect((await escribirHecho(ctx, dato)).texto).toContain("Primero el paso 1");
    expect((await ejecutarHerramienta(ctx, "fijar_alcance", { zona: "MP-C2" })).texto).toContain("Campos no válidos");

    const alcance = { norma: { valor: "MIVIOT-ML2", confianza: 0.9, fuente: { documento: "plano", pagina: 1, cita: "LINEA 2 DEL METRO", metodo: "lectura" } } };
    const r1 = JSON.parse((await ejecutarHerramienta(ctx, "fijar_alcance", alcance)).texto);
    expect(r1.aceptado).toBe(false);
    expect(r1.errores[0]).toContain("PERM-1");
    expect(r1.datos_de_alcance_que_faltan).toBeDefined();
    expect(JSON.parse(await readFile(join(dir, "alcance_ia.json"), "utf8"))).toEqual(alcance);
    const r2 = JSON.parse((await ejecutarHerramienta(ctx, "fijar_alcance", alcance)).texto);
    expect(r2.aceptado).toBe(true);
    expect(r2.permisos[0].efecto).toEqual(["exceptua ML2-RAMPA"]);
    expect(actualizadas).toBe(2);

    expect((await escribirHecho(ctx, dato)).texto).toContain("Escrito");
    const lote = JSON.parse(await readFile(join(dir, "lote.json"), "utf8"));
    expect(lote.proyecto.altura_m.fuente.documento).toBe("complementario-1.pdf");
  });
});
