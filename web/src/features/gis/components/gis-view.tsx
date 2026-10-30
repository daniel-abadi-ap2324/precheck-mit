"use client";

import { useCallback, useMemo, useState } from "react";
import { MapViewer, type MapFocus } from "@/components/map";
import { ErrorState } from "@/components/common";
import type { ZonePolygon } from "@/types";
import { useGisStore } from "../store";
import { useGisData } from "../hooks/use-gis-data";
import { useIsDesktop } from "../hooks/use-media-query";
import { useParcelUrlSync } from "../hooks/use-parcel-url-sync";
import { GisSidebar } from "./gis-sidebar";
import { GisDesktopSidebar } from "./gis-desktop-sidebar";
import { GisMobileInfo, GisMobileSidebar } from "./gis-mobile-sheets";
import { ParcelInfoPanel } from "./parcel-info-panel";
import { ZoneInfoPanel } from "./zone-info-panel";
import { SheetInfoPanel } from "./sheet-info-panel";
import { ZoningStatus } from "./zoning-status";
import { corregimientoAtPoint, sheetAtPoint } from "@/lib/gis/geo";
import type { PlaceResult } from "../lib/buscar-lugares";

/** Vista GIS a toda la altura: panel de búsqueda/capas, mapa y ficha del lote seleccionado. */
export function GisView({ initialParcelId }: { initialParcelId: string | null }) {
  useParcelUrlSync(initialParcelId);
  const isDesktop = useIsDesktop();
  const data = useGisData();
  const selectedParcelId = useGisStore((s) => s.selectedParcelId);
  const layers = useGisStore((s) => s.layers);
  const selectedZoneId = useGisStore((s) => s.selectedZoneId);
  const selectParcel = useGisStore((s) => s.selectParcel);
  const selectZone = useGisStore((s) => s.selectZone);
  const selectedLocation = useGisStore((s) => s.selectedLocation);
  const selectLocation = useGisStore((s) => s.selectLocation);
  const setMobileSidebarOpen = useGisStore((s) => s.setMobileSidebarOpen);
  // Encuadre pedido por la búsqueda (corregimiento, hoja o dirección); los lotes se encuadran por su selección.
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const close = useCallback(() => {
    selectParcel(null);
    selectZone(null);
    selectLocation(null);
    setFocus(null);
  }, [selectParcel, selectZone, selectLocation]);
  const selectedZone = useMemo(
    () => (selectedZoneId ? ((data.zonesAll.features.find((f) => f.properties?.id === selectedZoneId)?.properties as ZonePolygon | undefined) ?? null) : null),
    [selectedZoneId, data.zonesAll],
  );
  // Punto elegido fuera de lotes y zonas: su hoja del Documento Gráfico y su corregimiento.
  const sheetCell = useMemo(() => (selectedLocation ? sheetAtPoint(data.sheets, selectedLocation) : null), [selectedLocation, data.sheets]);
  const corregimiento = useMemo(() => (selectedLocation ? corregimientoAtPoint(data.corregimientos, selectedLocation) : null), [selectedLocation, data.corregimientos]);
  const selectedSheet = sheetCell?.hoja ?? null;
  const sheetEntry = useMemo(() => (selectedSheet ? (data.zoning.index?.hojas.find((h) => h.hoja === selectedSheet) ?? null) : null), [selectedSheet, data.zoning.index]);
  const showLocation = Boolean(selectedLocation && (sheetCell || corregimiento));
  const onSelectLocation = useCallback(
    (p: [number, number]) => {
      const inside = sheetAtPoint(data.sheets, p) || corregimientoAtPoint(data.corregimientos, p);
      selectLocation(inside ? p : null);
    },
    [data.sheets, data.corregimientos, selectLocation],
  );
  const onSearchSelect = useCallback(
    (place: PlaceResult) => {
      setMobileSidebarOpen(false);
      if (place.kind === "lote") {
        setFocus(null);
        selectParcel(place.parcel.id);
        return;
      }
      // Corregimiento u hoja: se encuadra entero. Dirección: se acerca al punto y se marca.
      setFocus(place.kind === "direccion" ? { key: place.id, point: place.point, zoom: 17 } : { key: place.id, bbox: place.bbox });
      selectParcel(null);
      selectZone(null);
      onSelectLocation(place.point);
    },
    [selectParcel, selectZone, onSelectLocation, setMobileSidebarOpen],
  );

  const sidebar = (
    <GisSidebar
      parcels={data.all}
      zones={data.zonesAll}
      visibleParcels={data.filtered.features.length}
      visibleZones={data.zones.features.length}
      coverage={data.coverage}
      corregimientos={data.corregimientos}
      sheets={data.sheets}
      onSelectPlace={onSearchSelect}
    />
  );
  const info = selectedParcelId ? (
    <ParcelInfoPanel parcelId={selectedParcelId} onClose={close} closeOnEscape={isDesktop} />
  ) : selectedZone ? (
    <ZoneInfoPanel zone={selectedZone} onClose={close} closeOnEscape={isDesktop} />
  ) : showLocation ? (
    <SheetInfoPanel hoja={selectedSheet} cell={sheetCell} entry={sheetEntry} corregimiento={corregimiento} onClose={close} closeOnEscape={isDesktop} />
  ) : null;
  const infoLabel = selectedParcelId ? "Panel del lote" : selectedZone ? "Panel de la zona" : "Panel de la hoja";
  const mobileLabel = selectedParcelId ? "Información del lote" : selectedZone ? "Información de la zona" : "Información de la hoja";

  return (
    <div className="flex min-h-0 flex-1">
      <h1 className="sr-only">Mapa</h1>
      {isDesktop ? <GisDesktopSidebar>{sidebar}</GisDesktopSidebar> : null}
      <div className="relative min-h-map min-w-0 flex-1">
        {data.error ? (
          <ErrorState error={data.error} onRetry={data.refetch} className="absolute inset-4 z-10 m-auto h-fit max-w-md" />
        ) : null}
        <MapViewer
          className="absolute inset-0 min-h-0 rounded-none border-0"
          parcels={data.filtered}
          zoning={data.zones}
          projects={data.projects}
          infrastructure={data.infrastructure}
          ocean={data.ocean}
          district={data.district}
          corregimientos={data.corregimientos}
          rivers={data.rivers}
          sheets={data.sheets}
          selectedSheet={selectedSheet}
          onSelectLocation={onSelectLocation}
          onViewportChange={data.zoning.onViewportChange}
          initialBounds={initialParcelId ? undefined : data.districtBounds}
          zoom={initialParcelId ? 16 : 11}
          visibleLayers={layers}
          focus={focus}
          selectedParcelId={selectedParcelId}
          onSelectParcel={selectParcel}
          selectedZoneId={selectedZoneId}
          onSelectZone={selectZone}
          ariaLabel="Mapa de lotes, zonificación del Documento Gráfico y capas. Para elegir un lote con el teclado, use la búsqueda del panel."
        />
        {layers.zoning ? (
          <ZoningStatus
            className={isDesktop ? "absolute inset-x-0 top-3 z-10" : "absolute inset-x-0 top-16 z-10"}
            active={data.zoning.active}
            loaded={data.zoning.loaded.length}
            requested={data.zoning.requested.length}
            isFetching={data.zoning.isFetching}
            hasError={Boolean(data.zoning.error)}
            onRetry={data.zoning.refetch}
          />
        ) : null}
        {isDesktop ? null : <GisMobileSidebar>{sidebar}</GisMobileSidebar>}
      </div>
      {isDesktop && info ? (
        <aside aria-label={infoLabel} className="relative w-panel shrink-0 border-l bg-card">
          <div className="absolute inset-0 overflow-y-auto">{info}</div>
        </aside>
      ) : null}
      {isDesktop ? null : (
        <GisMobileInfo open={Boolean(info)} onClose={close} label={mobileLabel}>
          {info}
        </GisMobileInfo>
      )}
      <p role="status" className="sr-only">
        {selectedParcelId
          ? `Lote ${selectedParcelId} seleccionado.`
          : selectedZone
            ? `Zona ${selectedZone.codigo ?? "sin código"} seleccionada.`
            : showLocation
              ? `Ubicación seleccionada${selectedSheet ? `: hoja ${selectedSheet}` : ""}${corregimiento ? `, corregimiento ${corregimiento.nombre}` : ""}.`
              : ""}
      </p>
    </div>
  );
}
