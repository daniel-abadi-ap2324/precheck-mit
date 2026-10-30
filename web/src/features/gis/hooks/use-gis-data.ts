"use client";

import { useMemo } from "react";
import { useGisLayer } from "@/hooks/use-gis";
import { useGisStore } from "../store";
import { filterParcelFeatures, filterZoneFeatures } from "../lib/filter-parcels";
import { featureCollectionBBox } from "@/lib/gis/geo";
import { DGZ_TOTAL_SHEETS } from "../lib/legend";
import { useViewportZoning } from "./use-viewport-zoning";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Capas de la vista GIS con los filtros aplicados del lado del cliente. */
export function useGisData() {
  const parcels = useGisLayer("parcels");
  const projects = useGisLayer("projects");
  const infrastructure = useGisLayer("infrastructure");
  const ocean = useGisLayer("ocean");
  const district = useGisLayer("district");
  const corregimientos = useGisLayer("corregimientos");
  const rivers = useGisLayer("rivers");
  const mosaico = useGisLayer("sheets");
  const zoning = useViewportZoning();
  const filters = useGisStore((s) => s.filters);
  const all = parcels.data ?? EMPTY;
  const zonesAll = zoning.zoning;
  const filtered = useMemo(() => filterParcelFeatures(all, filters), [all, filters]);
  const zones = useMemo(() => filterZoneFeatures(zonesAll, filters), [zonesAll, filters]);
  const vectorized = useMemo(() => new Set(zoning.index?.hojas.map((h) => h.hoja) ?? []), [zoning.index]);
  /** Mosaico con la marca `vectorizada` para colorear la cobertura. */
  const sheets = useMemo<GeoJSON.FeatureCollection>(
    () =>
      mosaico.data
        ? { type: "FeatureCollection", features: mosaico.data.features.map((f) => ({ ...f, properties: { ...f.properties, vectorizada: vectorized.has(String(f.properties?.hoja)) } })) }
        : EMPTY,
    [mosaico.data, vectorized],
  );
  const districtData = district.data ?? EMPTY;
  const districtBounds = useMemo(() => featureCollectionBBox(districtData), [districtData]);
  const layers = [parcels, projects, infrastructure, ocean, district, corregimientos, rivers, mosaico];
  return {
    all,
    filtered,
    zonesAll,
    zones,
    zoning,
    projects: projects.data ?? EMPTY,
    infrastructure: infrastructure.data ?? EMPTY,
    ocean: ocean.data ?? EMPTY,
    district: districtData,
    districtBounds,
    districtReady: !district.isPending,
    corregimientos: corregimientos.data ?? EMPTY,
    rivers: rivers.data ?? EMPTY,
    sheets,
    coverage: { vectorized: zoning.index?.hojas.length ?? null, total: mosaico.data?.features.length || DGZ_TOTAL_SHEETS },
    isLoading: parcels.isLoading,
    error: layers.find((l) => l.error)?.error ?? null,
    refetch: () => {
      layers.forEach((l) => void l.refetch());
      zoning.refetch();
    },
  };
}
