import { describe, expect, it } from "vitest";
import { marcaDeBbox, marcaValida, marcasDeEvidencia, marcasDePagina } from "./marcas";

describe("marcaValida", () => {
  it("acepta un rectángulo en fracciones y recorta lo que se sale de la página", () => {
    expect(marcaValida({ x: 0.2, y: 0.3, w: 0.1, h: 0.05, etiqueta: " Retiro " })).toEqual({ x: 0.2, y: 0.3, w: 0.1, h: 0.05, etiqueta: "Retiro" });
    expect(marcaValida({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 })).toEqual({ x: 0.9, y: 0.9, w: expect.closeTo(0.1), h: expect.closeTo(0.1) });
  });
  it("descarta lo inválido: fuera de la página, sin tamaño, no numérico o diminuto", () => {
    for (const m of [{ x: 1.5, y: 0, w: 0.1, h: 0.1 }, { x: 0.1, y: 0.1, w: 0, h: 0.1 }, { x: "0.1", y: 0.1, w: 0.1, h: 0.1 }, { x: 0.1, y: 0.1, w: 0.0001, h: 0.0001 }, null, "x"]) {
      expect(marcaValida(m)).toBeNull();
    }
  });
});

describe("marcasDeEvidencia", () => {
  it("toma las marcas de cada evidencia con su página y deja pasar el dictamen aunque una marca esté mal", () => {
    const m = marcasDeEvidencia([
      { pagina: 2, detalle: "Símbolo de corte A-08", marcas: [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, { x: 9, y: 9, w: 1, h: 1 }] },
      { pagina: null, detalle: "sin página", marcas: [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }] },
      { pagina: 7, detalle: "sin marcas" },
    ]);
    expect(m).toEqual([{ pagina: 2, x: 0.1, y: 0.1, w: 0.1, h: 0.1, origen: "ia", etiqueta: "Símbolo de corte A-08" }]);
  });
});

describe("marcaDeBbox", () => {
  const dims = { ancho_mm: 914, alto_mm: 610 };
  it("convierte puntos del PDF a fracciones de la página", () => {
    const ancho = (914 * 72) / 25.4;
    const m = marcaDeBbox([ancho / 2, 100, ancho / 2 + 50, 120], 3, dims, "lote.area_m2");
    expect(m).toMatchObject({ pagina: 3, origen: "lector", etiqueta: "lote.area_m2" });
    expect(m?.x).toBeCloseTo(0.5 - 4 / ancho, 3);
    expect(m?.w).toBeCloseTo(50 / ancho + 8 / ancho, 3);
  });
  it("sin bbox o sin tamaño de página no hay marca", () => {
    expect(marcaDeBbox(null, 1, dims)).toBeNull();
    expect(marcaDeBbox([0, 0, 10, 10], 1, undefined)).toBeNull();
    expect(marcaDeBbox([0, 0, 0, 0], 1, dims)).toBeNull();
  });
});

describe("marcasDePagina", () => {
  it("filtra por página", () => {
    const a = { pagina: 1, x: 0, y: 0, w: 0.1, h: 0.1, origen: "ia" as const };
    expect(marcasDePagina([a, { ...a, pagina: 2 }], 2)).toHaveLength(1);
    expect(marcasDePagina([a], null)).toEqual([]);
    expect(marcasDePagina(undefined, 1)).toEqual([]);
  });
});
