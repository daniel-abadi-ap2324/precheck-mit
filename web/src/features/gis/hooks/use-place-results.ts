"use client";

import { useMemo } from "react";
import { useAddressSearch, useParcelSearch } from "@/hooks/use-gis";
import { buscarCorregimientos, buscarHojas, combinarResultados, type PlaceResult } from "../lib/buscar-lugares";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Resultados de búsqueda de lugares para una consulta ya depurada: lotes, corregimientos, hojas del Documento
 * Gráfico y direcciones reales. Lo usan el mapa GIS y el paso «Ubicar el lote» del asistente.
 */
export function usePlaceResults(q: string, corregimientos: GeoJSON.FeatureCollection = EMPTY, sheets: GeoJSON.FeatureCollection = EMPTY) {
  const enough = q.trim().length >= 2;
  const lotes = useParcelSearch(q);
  const direcciones = useAddressSearch(q);
  const results: PlaceResult[] = useMemo(
    () =>
      enough
        ? combinarResultados({
            lotes: (lotes.data ?? []).slice(0, 5),
            corregimientos: buscarCorregimientos(q, corregimientos),
            hojas: buscarHojas(q, sheets),
            direcciones: direcciones.data ?? [],
          })
        : [],
    [enough, q, lotes.data, direcciones.data, corregimientos, sheets],
  );
  return {
    results,
    enough,
    fetching: lotes.isFetching || direcciones.isFetching,
    /** Falló la búsqueda de lotes (la de direcciones es opcional: ver addressError). */
    error: lotes.error,
    addressError: direcciones.isError,
  };
}
