import { describe, expect, it } from "vitest";
import { datosSinConfirmar, hechoRevisado, mensajeSinConfirmar } from "./barrera-precheck";

const leido = (hecho: string, valor: string | number | null = "x") => ({ hecho, valor });

describe("barrera para ejecutar el PreCheck (paso 1)", () => {
  it("lo leído sin confirmar no basta: faltan finca, área y zona", () => {
    const hechos = [leido("lote.finca", "071091"), leido("lote.area_m2", 727.54), leido("plano.zonificacion_declarada", "RM1")];
    expect(datosSinConfirmar(hechos)).toEqual(["la finca", "el área del lote", "la zona"]);
  });

  it("vale confirmado o corregido; la finca puede ser lote.fincas y la zona, el código de zona indicado", () => {
    const hechos = [
      { ...leido("lote.fincas", "071091, 071122"), confirmado: true },
      { ...leido("lote.area_m2", 850.5), corregido: true },
    ];
    expect(datosSinConfirmar(hechos)).toEqual(["la zona"]);
    expect(datosSinConfirmar(hechos, "1ZM6")).toEqual([]);
    expect(datosSinConfirmar(hechos, "  ")).toEqual(["la zona"]);
    expect(datosSinConfirmar([...hechos, { ...leido("plano.zonificacion_declarada", "RM1"), confirmado: true }])).toEqual([]);
  });

  it("lo leído claro (un solo valor, confianza >= 0.85) queda comprobado sin preguntar; lo dudoso no", () => {
    const claro = { ...leido("lote.finca", "078850"), estado: "ok", confianza: 0.9 };
    expect(hechoRevisado(claro)).toBe(true);
    expect(hechoRevisado({ ...claro, confianza: 0.84 })).toBe(false);
    expect(hechoRevisado({ ...claro, estado: "revision" })).toBe(false);
  });

  it("una confirmación sin valor no cuenta", () => {
    expect(hechoRevisado({ hecho: "lote.finca", valor: null, confirmado: true })).toBe(false);
    expect(hechoRevisado(undefined)).toBe(false);
  });

  it("el mensaje dice qué falta y que la zona también vale como código", () => {
    expect(mensajeSinConfirmar(["la finca", "el área del lote", "la zona"])).toBe(
      "No se pudo comprobar en el plano la finca, el área del lote y la zona. Para ejecutar el PreCheck, confírmelo o corríjalo en la lectura del plano (o indique el código de zona).",
    );
    expect(mensajeSinConfirmar(["el área del lote"])).toBe("No se pudo comprobar en el plano el área del lote. Para ejecutar el PreCheck, confírmelo o corríjalo en la lectura del plano.");
  });
});
