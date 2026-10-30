import { describe, expect, it } from "vitest";
import type { ZoningSheetEntry } from "@/types";
import {
  corregimientoAtPoint,
  featureCollectionBBox,
  nearestLineDistance,
  pointInPolygon,
  pointSegmentDistance,
  sheetAtPoint,
  sheetsForViewport,
  type BBox,
} from "./geo";

/** 1e-3° de longitud en el ecuador ≈ 111,2 m; en Panamá (lat 9°) ≈ 109,8 m. */
const M_PER_MILLIDEG_EQ = 111.195;

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (coords: [number, number][], props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
const rect = ([x0, y0, x1, y1]: BBox, props: Record<string, unknown>): GeoJSON.Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
});

describe("pointSegmentDistance", () => {
  it("proyecta sobre el segmento y se queda en los extremos", () => {
    expect(pointSegmentDistance([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(pointSegmentDistance([-4, 3], [0, 0], [10, 0])).toBe(5);
    expect(pointSegmentDistance([2, 2], [1, 1], [1, 1])).toBeCloseTo(Math.SQRT2);
  });
});

describe("nearestLineDistance (ríos)", () => {
  const lot: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[0, 0], [0.0002, 0], [0.0002, 0.0002], [0, 0.0002], [0, 0]]] };

  it("mide en metros del borde del lote al río más cercano (equirectangular)", () => {
    const rivers = fc([line([[0.0007, -0.001], [0.0007, 0.001]], { nombre: "lejano" }), line([[0.0006, -0.001], [0.0006, 0.001]], { nombre: "cercano" })]);
    const r = nearestLineDistance(lot, rivers);
    expect(r?.properties).toEqual({ nombre: "cercano" });
    // 0,0004° entre el borde este del lote (0,0002) y el río (0,0006).
    expect(r?.distanceM).toBeCloseTo(0.4 * M_PER_MILLIDEG_EQ, 0);
  });

  it("aplica el coseno de la latitud: a 9° N un grado de longitud mide menos", () => {
    const at9 = nearestLineDistance({ type: "Point", coordinates: [-79.5, 9] }, fc([line([[-79.499, 8.99], [-79.499, 9.01]])]));
    expect(at9?.distanceM).toBeCloseTo(M_PER_MILLIDEG_EQ * Math.cos((9 * Math.PI) / 180), 0);
  });

  it("vale 0 si el río cruza el lote aunque no tenga vértices dentro", () => {
    const r = nearestLineDistance(lot, fc([line([[-0.001, 0.0001], [0.001, 0.0001]])]));
    expect(r?.distanceM).toBe(0);
  });

  it("devuelve null sin ríos", () => {
    expect(nearestLineDistance(lot, fc([]))).toBeNull();
  });
});

describe("hoja y corregimiento que contienen un punto", () => {
  const mosaico = fc([rect([0, 0, 1, 1], { hoja: "10-3A", escala: "1:10.000", pdf: "a.pdf" }), rect([1, 0, 2, 1], { hoja: "10-3B", escala: "1:10.000", pdf: "b.pdf" })]);

  it("encuentra la celda del mosaico", () => {
    expect(sheetAtPoint(mosaico, [1.5, 0.5])?.hoja).toBe("10-3B");
    expect(sheetAtPoint(mosaico, [0.2, 0.9])?.pdf).toBe("a.pdf");
    expect(sheetAtPoint(mosaico, [3, 3])).toBeNull();
  });

  it("respeta los huecos de los polígonos", () => {
    const donut: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
      ],
    };
    expect(pointInPolygon([0.5, 0.5], donut)).toBe(true);
    expect(pointInPolygon([2, 2], donut)).toBe(false);
  });

  it("encuentra el corregimiento (MultiPolygon incluido)", () => {
    const corr = fc([
      {
        type: "Feature",
        properties: { nombre: "Ancón", area_ha: 19342.6 },
        geometry: { type: "MultiPolygon", coordinates: [[[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]], [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] },
      },
    ]);
    expect(corregimientoAtPoint(corr, [0.5, 0.5])?.nombre).toBe("Ancón");
    expect(corregimientoAtPoint(corr, [3, 3])).toBeNull();
  });
});

describe("sheetsForViewport", () => {
  const entry = (hoja: string, bbox: BBox | null): ZoningSheetEntry => ({ hoja, bbox, escala: "1:10.000", pdf: null, fecha_hoja: "Octubre 2023", poligonos: 1, por_estado: { ok: 1, sin_etiqueta: 0, conflicto: 0 } });
  const grid = Array.from({ length: 9 }, (_, i) => entry(`H${i}`, [i % 3, Math.floor(i / 3), (i % 3) + 1, Math.floor(i / 3) + 1]));

  it("no carga nada por debajo del zoom 13", () => {
    expect(sheetsForViewport(grid, [0, 0, 3, 3], 12.9)).toEqual([]);
  });

  it("elige las hojas que cortan la vista", () => {
    expect(sheetsForViewport(grid, [0.2, 0.2, 1.5, 0.8], 14)).toEqual(["H0", "H1"]);
    expect(sheetsForViewport([...grid, entry("SIN-BBOX", null)], [10, 10, 11, 11], 14)).toEqual([]);
  });

  it("limita a 6 hojas, las más cercanas al centro", () => {
    const picked = sheetsForViewport(grid, [0, 0, 3, 3], 13);
    expect(picked).toHaveLength(6);
    expect(picked).toContain("H4");
    expect(sheetsForViewport(grid, [0, 0, 3, 3], 13, { max: 1 })).toEqual(["H4"]);
  });
});

describe("featureCollectionBBox", () => {
  it("abarca polígonos y líneas", () => {
    expect(featureCollectionBBox(fc([rect([0, 0, 1, 1], {}), line([[-2, 5], [3, -1]])]))).toEqual([-2, -1, 3, 5]);
    expect(featureCollectionBBox(fc([]))).toBeNull();
  });
});
