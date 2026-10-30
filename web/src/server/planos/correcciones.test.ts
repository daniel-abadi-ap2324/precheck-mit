// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PlanExtraction } from "@/types";
import { aplicarCorrecciones, esConfirmar } from "./correcciones";

const EXT: PlanExtraction = {
  formato: "1.0.0",
  documento: "a.pdf",
  sha256: "0",
  paginas: [],
  escalas: [],
  requisitos_anexo_iv: [],
  hechos: [
    { hecho: "lote.finca", valor: "071091", confianza: 0.9, estado: "ok", fuente: { metodo: "ocr", pagina: 2, bbox: [1, 2, 3, 4] } },
    { hecho: "proyecto.pisos_totales", valor: null, confianza: 0.5, estado: "revision", fuente: null, candidatos: [16, 15] },
  ],
};

describe("aplicarCorrecciones con confirmaciones", () => {
  it("confirmar conserva el valor y el lugar donde se leyó, con procedencia «humano» y confianza 1", () => {
    const r = aplicarCorrecciones(EXT, { "lote.finca": { confirmado: true, actualizadoEn: "x" } });
    expect(r.hechos[0]).toEqual({ ...EXT.hechos[0], confianza: 1, estado: "ok", fuente: { metodo: "humano", pagina: 2, bbox: [1, 2, 3, 4] }, confirmado: true });
  });

  it("una confirmación de un dato dudoso o inexistente se ignora (no hay valor que confirmar)", () => {
    const r = aplicarCorrecciones(EXT, { "proyecto.pisos_totales": { confirmado: true, actualizadoEn: "x" }, "lote.area_m2": { confirmado: true, actualizadoEn: "x" } });
    expect(r.hechos).toEqual(EXT.hechos);
  });

  it("esConfirmar solo acepta { confirmar: true } exacto", () => {
    expect(esConfirmar({ confirmar: true })).toBe(true);
    expect(esConfirmar({ confirmar: "true" })).toBe(false);
    expect(esConfirmar({ confirmar: true, otro: 1 })).toBe(false);
    expect(esConfirmar(null)).toBe(false);
    expect(esConfirmar([true])).toBe(false);
  });
});
