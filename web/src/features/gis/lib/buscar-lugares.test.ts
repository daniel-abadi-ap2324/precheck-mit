import { describe, expect, it } from "vitest";
import { buscarCorregimientos, buscarHojas, combinarResultados, hayLotesCerca, loteResult, normalizar } from "./buscar-lugares";

const box = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const corr = (id: string, nombre: string, g: GeoJSON.Polygon): GeoJSON.Feature => ({ type: "Feature", geometry: g, properties: { id, nombre, distrito: "Panamá", provincia: "Panamá", area_ha: 1, etiqueta: [g.coordinates[0][0][0] + 0.01, g.coordinates[0][0][1] + 0.01] } });
const CORR = fc([
  corr("080809", "San Francisco", box(-79.52, 8.98, -79.49, 9.0)),
  corr("080806", "Betania", box(-79.55, 8.99, -79.52, 9.03)),
  corr("080812", "Parque Lefevre", box(-79.49, 8.99, -79.47, 9.02)),
  corr("080803", "La Exposición o Calidonia", box(-79.54, 8.96, -79.52, 8.98)),
]);
const MOSAICO = fc([
  { type: "Feature", geometry: box(-79.59, 8.97, -79.51, 9.01), properties: { hoja: "10-3B", escala: "1:10.000", pdf: null } },
  { type: "Feature", geometry: box(-79.52, 8.98, -79.5, 9.0), properties: { hoja: "5-5D", escala: "1:5.000", pdf: null } },
  { type: "Feature", geometry: box(-79.5, 8.95, -79.4, 9.0), properties: { hoja: "10-4A", escala: "1:10.000", pdf: null } },
]);

describe("normalizar", () => {
  it("ignora tildes, mayúsculas y espacios repetidos", () => {
    expect(normalizar("  Vía  ESPAÑA ")).toBe("via espana");
  });
});

describe("buscarCorregimientos", () => {
  it("encuentra por nombre sin tildes y devuelve la caja y el punto del rótulo", () => {
    const [r] = buscarCorregimientos("exposicion", CORR);
    expect(r).toMatchObject({ kind: "corregimiento", label: "La Exposición o Calidonia", bbox: [-79.54, 8.96, -79.52, 8.98], point: [-79.53, 8.97] });
  });

  it("pone primero los que empiezan por la consulta", () => {
    expect(buscarCorregimientos("fr", CORR).map((r) => r.label)).toEqual(["San Francisco"]);
    expect(buscarCorregimientos("e", CORR)).toEqual([]);
    expect(buscarCorregimientos("pa", CORR).map((r) => r.label)).toEqual(["Parque Lefevre"]);
  });
});

describe("buscarHojas", () => {
  it("encuentra la hoja con o sin guion y exige un dígito", () => {
    expect(buscarHojas("10-3b", MOSAICO).map((r) => r.label)).toEqual(["10-3B"]);
    expect(buscarHojas("103B", MOSAICO).map((r) => r.label)).toEqual(["10-3B"]);
    expect(buscarHojas("10", MOSAICO).map((r) => r.label)).toEqual(["10-3B", "10-4A"]);
    expect(buscarHojas("betania", MOSAICO)).toEqual([]);
  });

  it("devuelve la caja de la hoja y su centro", () => {
    expect(buscarHojas("5-5D", MOSAICO)[0]).toMatchObject({ detail: "Hoja del Documento Gráfico · 1:5.000", bbox: [-79.52, 8.98, -79.5, 9.0] });
  });
});

describe("combinarResultados", () => {
  it("ordena lotes, corregimientos, hojas y direcciones", () => {
    const res = combinarResultados({
      lotes: [],
      corregimientos: buscarCorregimientos("san", CORR),
      hojas: buscarHojas("5-5", MOSAICO),
      direcciones: [{ id: "W1", label: "Vía España", detail: "Bella Vista", point: [-79.52, 8.99] }],
    });
    expect(res.map((r) => r.kind)).toEqual(["corregimiento", "hoja", "direccion"]);
    expect(res[2]).toMatchObject({ id: "dir-W1", point: [-79.52, 8.99] });
  });
});

describe("hayLotesCerca", () => {
  const lotes = fc([{ type: "Feature", geometry: box(-79.5306, 8.9951, -79.5304, 8.9953), properties: { id: "PAR-1" } }]);
  const lugar = (p: Partial<{ bbox: [number, number, number, number]; point: [number, number] }>) => ({ kind: "direccion" as const, id: "x", label: "x", detail: "x", point: [0, 0] as [number, number], ...p });

  it("con caja: hay lotes si alguno cae dentro", () => {
    expect(hayLotesCerca(lotes, { ...lugar({}), kind: "corregimiento", bbox: [-79.56, 8.98, -79.5, 9.03] })).toBe(true);
    expect(hayLotesCerca(lotes, { ...lugar({}), kind: "corregimiento", bbox: [-79.52, 8.98, -79.49, 9.0] })).toBe(false);
  });

  it("con punto: hay lotes a menos de 500 m (lo que se ve a zoom 17)", () => {
    expect(hayLotesCerca(lotes, lugar({ point: [-79.534, 8.9952] }))).toBe(true); // ≈ 390 m
    expect(hayLotesCerca(lotes, lugar({ point: [-79.5215, 8.9932] }))).toBe(false); // Vía España, ≈ 1 km
  });
});

describe("loteResult", () => {
  it("marca el lote dibujado por el profesional", () => {
    const p = { id: "DECL-0001", origen: "declarado" as const, finca: "1", areaM2: 900, zoningCode: "ZM7", landUse: "x", centroid: [0, 0] as [number, number], geometry: { type: "Polygon" as const, coordinates: [] }, district: "Panamá", corregimiento: "Pueblo Nuevo", address: "Calle 17" };
    expect(loteResult(p).detail).toBe("Lote declarado (no es catastro) · Calle 17 · Zona ZM7");
  });
});
