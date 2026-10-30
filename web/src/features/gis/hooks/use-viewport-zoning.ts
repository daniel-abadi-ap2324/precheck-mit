"use client";

import { useMemo, useState } from "react";
import type { MapViewport } from "@/components/map";
import { useZoningIndex, useZoningSheets } from "@/hooks/use-gis";
import { sheetsForViewport, ZONING_MIN_ZOOM } from "@/lib/gis/geo";
import { acumularHojas } from "../lib/acumular-hojas";

/**
 * Zonificación que sigue a la vista del mapa: desde zoom 13 pide las hojas vectorizadas que cortan la vista
 * (máximo 6, las más cercanas al centro) y las SUMA a las ya cargadas (hasta 12). Al mover el mapa la capa no
 * se vacía; solo se actualiza cuando llega una hoja nueva. Al alejar, el MapViewer la oculta por zoom de capa.
 */
export function useViewportZoning() {
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);
  const index = useZoningIndex();
  const requested = useMemo(
    () => (viewport && index.data ? sheetsForViewport(index.data.hojas, viewport.bounds, viewport.zoom) : []),
    [viewport, index.data],
  );
  // Acumular durante el render (patrón de estado derivado de React): solo cambia si hay hojas nuevas.
  const siguientes = acumularHojas(hojas, requested);
  if (siguientes !== hojas) setHojas(siguientes);
  const sheets = useZoningSheets(siguientes);
  return {
    onViewportChange: setViewport,
    viewport,
    index: index.data ?? null,
    zoning: sheets.zoning,
    requested,
    loaded: sheets.loaded.filter((h) => requested.includes(h)),
    isFetching: sheets.isFetching || index.isFetching,
    /** true si la vista está lo bastante cerca para mostrar zonificación. */
    active: (viewport?.zoom ?? 0) >= ZONING_MIN_ZOOM,
    error: index.error ?? sheets.error,
    refetch: () => {
      void index.refetch();
      sheets.refetch();
    },
  };
}
