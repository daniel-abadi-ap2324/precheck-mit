/** Filtros de la vista GIS. Funciones puras: no tocan el mapa ni la red. */
export interface GisFilters {
  /** Familias de zona seleccionadas (capa de zonificación); vacío = todas. */
  familias: string[];
  /** Usos de suelo seleccionados (lotes de demostración); vacío = todos. */
  landUses: string[];
}

export const EMPTY_FILTERS: GisFilters = { familias: [], landUses: [] };

function propertyOf(feature: GeoJSON.Feature, key: string): string | undefined {
  const value = feature.properties?.[key];
  return typeof value === "string" ? value : undefined;
}

/** Devuelve una FeatureCollection nueva con los features cuya propiedad `key` está en `values` (vacío = todos). */
export function filterByProperty(fc: GeoJSON.FeatureCollection, key: string, values: string[]): GeoJSON.FeatureCollection {
  if (values.length === 0) return fc;
  const features = fc.features.filter((f) => {
    const v = propertyOf(f, key);
    return v !== undefined && values.includes(v);
  });
  return { type: "FeatureCollection", features };
}

/** Lotes de demostración filtrados por uso de suelo. */
export const filterParcelFeatures = (fc: GeoJSON.FeatureCollection, filters: Pick<GisFilters, "landUses">) => filterByProperty(fc, "landUse", filters.landUses);

/** Polígonos del Documento Gráfico filtrados por familia de zona. */
export const filterZoneFeatures = (fc: GeoJSON.FeatureCollection, filters: Pick<GisFilters, "familias">) => filterByProperty(fc, "familia", filters.familias);

/** Valores distintos de una propiedad, ordenados, para construir las opciones de filtro. */
export function distinctValues(fc: GeoJSON.FeatureCollection | undefined, key: string): string[] {
  if (!fc) return [];
  const set = new Set<string>();
  for (const f of fc.features) {
    const v = propertyOf(f, key);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

/** Cuenta de features por valor de una propiedad. */
export function countBy(fc: GeoJSON.FeatureCollection | undefined, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fc?.features ?? []) {
    const v = propertyOf(f, key);
    if (v) out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
