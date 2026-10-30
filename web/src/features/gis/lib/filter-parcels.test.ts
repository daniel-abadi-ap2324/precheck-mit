import { describe, expect, it } from "vitest";
import { countBy, distinctValues, filterParcelFeatures, filterZoneFeatures, toggleValue } from "./filter-parcels";

const feature = (id: string, props: Record<string, string>): GeoJSON.Feature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: { id, ...props },
});

const parcels: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [feature("A", { landUse: "Mixto" }), feature("B", { landUse: "Comercial" }), feature("C", { landUse: "Comercial" }), feature("D", { landUse: "Institucional" })],
};

const zones: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [feature("Z1", { familia: "mixta" }), feature("Z2", { familia: "miviot" }), feature("Z3", { familia: "mixta" }), feature("Z4", { familia: "sin_etiqueta" })],
};

const ids = (c: GeoJSON.FeatureCollection) => c.features.map((f) => f.properties?.id);

describe("filtros de la vista GIS", () => {
  it("devuelve la misma colección si no hay filtros", () => {
    expect(filterParcelFeatures(parcels, { landUses: [] })).toBe(parcels);
    expect(filterZoneFeatures(zones, { familias: [] })).toBe(zones);
  });

  it("filtra lotes por uno o varios usos de suelo", () => {
    expect(ids(filterParcelFeatures(parcels, { landUses: ["Comercial"] }))).toEqual(["B", "C"]);
    expect(ids(filterParcelFeatures(parcels, { landUses: ["Mixto", "Institucional"] }))).toEqual(["A", "D"]);
  });

  it("filtra polígonos de zona por familia", () => {
    expect(ids(filterZoneFeatures(zones, { familias: ["mixta"] }))).toEqual(["Z1", "Z3"]);
    expect(ids(filterZoneFeatures(zones, { familias: ["miviot", "sin_etiqueta"] }))).toEqual(["Z2", "Z4"]);
  });

  it("no muta la colección original", () => {
    filterZoneFeatures(zones, { familias: ["miviot"] });
    expect(zones.features).toHaveLength(4);
  });

  it("excluye features sin la propiedad filtrada", () => {
    const withMissing: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [...parcels.features, { type: "Feature", geometry: null as unknown as GeoJSON.Geometry, properties: {} }] };
    expect(ids(filterParcelFeatures(withMissing, { landUses: ["Mixto"] }))).toEqual(["A"]);
  });
});

describe("helpers", () => {
  it("distinctValues ordena y quita duplicados", () => {
    expect(distinctValues(zones, "familia")).toEqual(["miviot", "mixta", "sin_etiqueta"]);
    expect(distinctValues(undefined, "familia")).toEqual([]);
  });

  it("countBy cuenta por valor", () => {
    expect(countBy(zones, "familia")).toEqual({ mixta: 2, miviot: 1, sin_etiqueta: 1 });
  });

  it("toggleValue agrega y quita", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});
