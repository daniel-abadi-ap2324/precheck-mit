"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api, type GisLayerName } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";

export const useGisLayer = (layer: GisLayerName) =>
  useQuery({ queryKey: queryKeys.gisLayer(layer), queryFn: () => api.getGisLayer({ layer }), staleTime: Infinity });

export const useParcelSearch = (q: string) =>
  useQuery({ queryKey: queryKeys.parcels(q), queryFn: () => api.searchParcels(q), enabled: q.trim().length >= 2 });

/** Índice de hojas vectorizadas del Documento Gráfico. */
export const useZoningIndex = () => useQuery({ queryKey: queryKeys.zoningIndex(), queryFn: () => api.getZoningIndex(), staleTime: Infinity });

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Zonificación de varias hojas fusionada en una sola colección. Cada hoja queda en la caché (React Query y el
 * adaptador); la colección fusionada solo cambia cuando cambia el conjunto de hojas ya cargadas.
 */
export function useZoningSheets(hojas: string[]) {
  const results = useQueries({
    queries: hojas.map((hoja) => ({ queryKey: queryKeys.zoningSheet(hoja), queryFn: () => api.getZoningSheet(hoja), staleTime: Infinity })),
  });
  const loaded = hojas.filter((_, i) => results[i]?.data);
  const loadedKey = loaded.join("|");
  const datas = results.map((r) => r.data);
  // La identidad de `datas` cambia en cada render; la clave de hojas cargadas basta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zoning = useMemo(() => (loaded.length ? { type: "FeatureCollection" as const, features: datas.flatMap((d) => d?.features ?? []) } : EMPTY), [loadedKey]);
  return {
    zoning,
    loaded,
    isFetching: results.some((r) => r.isFetching),
    error: results.find((r) => r.error)?.error ?? null,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

/** Direcciones reales (geocodificador). Desde 3 caracteres; un fallo no reintenta ni bloquea los resultados locales. */
export const useAddressSearch = (q: string) =>
  useQuery({
    queryKey: queryKeys.addresses(q),
    queryFn: () => api.geocodeAddress(q),
    enabled: q.trim().length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
  });
