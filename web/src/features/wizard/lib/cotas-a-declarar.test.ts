import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COTAS_A_DECLARAR } from "./cotas-a-declarar";

const CONTRATO = ["hechos_documentales.json", "datos_universales.json"]
  .map((f) => readFileSync(resolve(__dirname, "../../../../../scripts", f), "utf8"))
  .join("\n");

describe("COTAS_A_DECLARAR", () => {
  it("cada clave es un dato del contrato (el aviso no pide cotas que nadie usa)", () => {
    const faltan = COTAS_A_DECLARAR.flatMap((c) => c.claves).filter((k) => !CONTRATO.includes(`"${k}"`));
    expect(faltan).toEqual([]);
  });

  it("incluye los datos que más fallan al medir a escala", () => {
    const claves = COTAS_A_DECLARAR.flatMap((c) => c.claves);
    for (const k of ["lote.frente_m", "proyecto.retiro_posterior_m", "proyecto.altura_m", "acceso_vehicular.rotura_cordon_m"]) expect(claves).toContain(k);
  });
});
