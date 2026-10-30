import { describe, expect, it } from "vitest";
import { muestrasDelLote, puntoInterior, zonasDelLote } from "./zonas-del-lote";
import type { Punto } from "./lote-dibujado";

const box = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const zona = (id: string, g: GeoJSON.Polygon, codigo: string): GeoJSON.Feature => ({
  type: "Feature",
  geometry: g,
  properties: { id, codigo, codigos: [codigo], codigo_ficha: codigo.slice(1), familia: "mixta", estado: "ok", hoja: "5-5E", fecha_hoja: "Octubre 2025", area_m2: 1 },
});
const HOJA: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [zona("A", box(0, 0, 0.001, 0.001), "1R3"), zona("B", box(0.001, 0, 0.002, 0.001), "1ZM6")],
};
const cuadrado = (x0: number, x1: number): Punto[] => [[x0, 0.0002], [x1, 0.0002], [x1, 0.0008], [x0, 0.0008]];

describe("zonas del lote (por área, no por el centroide)", () => {
  it("un lote dentro de una sola zona la cubre al 100 %", () => {
    const r = zonasDelLote(cuadrado(0.0002, 0.0008), [HOJA]);
    expect(r.zonas.map((z) => [z.poligono, z.pct])).toEqual([["A", 100]]);
    expect(r.sinZonaPct).toBe(0);
  });

  it("un lote repartido entre dos zonas devuelve ambas con su porcentaje", () => {
    // 60 % en A (0,0004–0,001) y 40 % en B (0,001–0,0014).
    const r = zonasDelLote(cuadrado(0.0004, 0.0014), [HOJA]);
    expect(r.zonas.map((z) => z.poligono)).toEqual(["A", "B"]);
    expect(r.zonas[0].pct).toBeCloseTo(60, 0);
    expect(r.zonas[1].pct).toBeCloseTo(40, 0);
  });

  it("la parte que no cae en ninguna zona cargada se informa aparte", () => {
    const r = zonasDelLote(cuadrado(0.0016, 0.0026), [HOJA]);
    expect(r.zonas[0].pct).toBeCloseTo(40, 0);
    expect(r.sinZonaPct).toBeCloseTo(60, 0);
  });

  it("las muestras quedan dentro del lote y el punto interior también, aunque el lote sea cóncavo", () => {
    // Lote en L: su centroide cae en el hueco.
    const L: Punto[] = [[0, 0], [0.001, 0], [0.001, 0.0002], [0.0002, 0.0002], [0.0002, 0.001], [0, 0.001]];
    const m = muestrasDelLote(L);
    expect(m.length).toBeGreaterThan(500);
    expect(m.every(([x, y]) => !(x > 0.0002 && y > 0.0002))).toBe(true);
    const [x, y] = puntoInterior(L);
    expect(x > 0.0002 && y > 0.0002).toBe(false);
  });

  it("un lote delgado y girado tiene suficientes muestras, y la fracción no se redondea antes de comparar", () => {
    // Franja de ~2 m × 70 m en diagonal: la caja es casi toda vacía.
    const d = 2 / 111_320;
    const L = 0.00063;
    const franja: Punto[] = [[0.0002, 0.0002], [0.0002 + L, 0.0002 + L], [0.0002 + L - d, 0.0002 + L + d], [0.0002 - d, 0.0002 + d]];
    expect(muestrasDelLote(franja).length).toBeGreaterThanOrEqual(2000);
    const r = zonasDelLote(franja, [HOJA]);
    expect(r.zonas[0].fraccion).toBeGreaterThan(0);
    expect(r.zonas[0].fraccion).toBeLessThanOrEqual(1);
    expect(r.muestras).toBeGreaterThanOrEqual(2000);
  });
});
