"use client";

import { useMemo, type ReactNode } from "react";
import { ZONING_FAMILY_ORDER } from "@/config/zoning-colors";
import { countBy, distinctValues } from "../lib/filter-parcels";
import { PlaceSearch } from "./place-search";
import type { PlaceResult } from "../lib/buscar-lugares";
import { LayerList } from "./layer-list";
import { GisFilters } from "./gis-filters";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`gis-${title}`} className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0">
      <h2 id={`gis-${title}`} className="text-sm font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface GisSidebarProps {
  parcels: GeoJSON.FeatureCollection;
  zones: GeoJSON.FeatureCollection;
  visibleParcels: number;
  visibleZones: number;
  coverage: { vectorized: number | null; total: number };
  corregimientos: GeoJSON.FeatureCollection;
  sheets: GeoJSON.FeatureCollection;
  onSelectPlace: (place: PlaceResult) => void;
}

/** Contenido del panel lateral: Buscar, Capas y Filtros. Se usa en el panel de escritorio y en la hoja móvil. */
export function GisSidebar({ parcels, zones, visibleParcels, visibleZones, coverage, corregimientos, sheets, onSelectPlace }: GisSidebarProps) {
  const familyCounts = useMemo(() => countBy(zones, "familia"), [zones]);
  const familyOrder = ZONING_FAMILY_ORDER.filter((f) => familyCounts[f]);
  return (
    <div className="flex flex-col">
      <Section title="Buscar">
        <PlaceSearch corregimientos={corregimientos} sheets={sheets} onSelect={onSelectPlace} />
      </Section>
      <Section title="Capas">
        <LayerList zoningFamilies={familyOrder.length ? familyOrder : undefined} coverage={coverage} />
      </Section>
      <Section title="Filtros">
        <GisFilters
          familyCounts={familyCounts}
          familyOrder={familyOrder}
          landUseOptions={distinctValues(parcels, "landUse")}
          visibleZones={visibleZones}
          totalZones={zones.features.length}
          visibleParcels={visibleParcels}
          totalParcels={parcels.features.length}
        />
      </Section>
    </div>
  );
}
