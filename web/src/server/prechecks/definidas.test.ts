// @vitest-environment node
import { describe, expect, it } from "vitest";
import { textoDefinidas } from "@/server/ia/definidas-texto";
import { validarDatos, valoresDefinidos } from "./almacen";

const BASE = { tramite: "RLA", fechaPresentacion: "2026-10-15", normaAplicable: "PLOT-A61-2021" };
const datosDe = (extra: Record<string, unknown>) => {
  const v = validarDatos({ ...BASE, ...extra });
  if ("mensaje" in v) throw new Error(v.mensaje);
  return v.datos;
};

describe("variables definidas por el arquitecto", () => {
  it("se guardan la zona y los datos del cuadro que traen valor", () => {
    const d = datosDe({ codigoZona: "R2-A", datosDeclarados: { "proyecto.altura_m": 12, "lote.area_m2": 892.03 }, definidas: ["lote.codigo_zona", "proyecto.altura_m"] });
    expect(d.definidas).toEqual(["lote.codigo_zona", "proyecto.altura_m"]);
    expect(valoresDefinidos(d)).toEqual({ "lote.codigo_zona": "R2-A", "proyecto.altura_m": 12 });
  });

  it("descarta lo que no se puede definir: zona sin código, claves ajenas o sin valor, y repetidas", () => {
    const d = datosDe({ datosDeclarados: { "proyecto.altura_m": 12 }, definidas: ["lote.codigo_zona", "proyecto.pisos_totales", "x.y", "proyecto.altura_m", "proyecto.altura_m", 7] });
    expect(d.definidas).toEqual(["proyecto.altura_m"]);
  });

  it("sin variables definidas no hay campo ni valores", () => {
    const d = datosDe({ codigoZona: "R2", definidas: [] });
    expect(d.definidas).toBeUndefined();
    expect(valoresDefinidos(d)).toEqual({});
  });
});

describe("textoDefinidas (instrucción para la IA)", () => {
  it("vacío si no hay nada definido", () => {
    expect(textoDefinidas({})).toBe("");
  });

  it("dice que no se cuestionan ni se escriben, con los valores", () => {
    const t = textoDefinidas({ "lote.codigo_zona": "R2-A", "proyecto.altura_m": 12 });
    expect(t).toContain('lote.codigo_zona = "R2-A"');
    expect(t).toContain("proyecto.altura_m = 12");
    expect(t).toMatch(/no las cuestiones/);
    expect(t).toMatch(/no cambies la zona/);
  });
});
