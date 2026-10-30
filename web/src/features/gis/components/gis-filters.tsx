"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { zoningFamilyColors } from "@/config/zoning-colors";
import type { ZoningFamily } from "@/types";
import { useGisStore } from "../store";
import { AreaKey } from "./map-keys";

interface FilterOption {
  value: string;
  label: string;
  count?: number;
  key?: ReactNode;
}

function FilterGroup({ legend, options, selected, onToggle }: { legend: string; options: FilterOption[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-6 cursor-pointer items-center gap-2.5 text-sm pointer-coarse:min-h-11">
          <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
          <span className="min-w-0 flex-1">{o.label}</span>
          {o.count !== undefined ? <span className="tabular text-xs text-muted-foreground">{o.count}</span> : null}
          {o.key}
        </label>
      ))}
    </fieldset>
  );
}

interface GisFiltersProps {
  /** Familias presentes en la capa y su número de polígonos. */
  familyCounts: Record<string, number>;
  familyOrder: string[];
  landUseOptions: string[];
  visibleZones: number;
  totalZones: number;
  visibleParcels: number;
  totalParcels: number;
}

/** Filtros del lado del cliente: familia de zona (capa de zonificación) y uso de suelo (lotes). Sin selección = todos. */
export function GisFilters({ familyCounts, familyOrder, landUseOptions, visibleZones, totalZones, visibleParcels, totalParcels }: GisFiltersProps) {
  const filters = useGisStore((s) => s.filters);
  const toggleFamilia = useGisStore((s) => s.toggleFamiliaFilter);
  const toggleLandUse = useGisStore((s) => s.toggleLandUseFilter);
  const clear = useGisStore((s) => s.clearFilters);
  const active = filters.familias.length + filters.landUses.length > 0;
  const familyOptions: FilterOption[] = familyOrder.map((f) => {
    const s = zoningFamilyColors[f as ZoningFamily];
    return { value: f, label: s?.label ?? f, count: familyCounts[f], key: s ? <AreaKey fill={s.fill} line={s.line} dashed={s.dashed} /> : null };
  });
  return (
    <div className="flex flex-col gap-4">
      <FilterGroup legend="Familia de zona" options={familyOptions} selected={filters.familias} onToggle={toggleFamilia} />
      <FilterGroup legend="Uso de suelo (lotes de demostración)" options={landUseOptions.map((u) => ({ value: u, label: u }))} selected={filters.landUses} onToggle={toggleLandUse} />
      <div className="flex items-start justify-between gap-2">
        <p role="status" className="tabular text-xs text-muted-foreground">
          {visibleZones} de {totalZones} polígonos de zona
          <br />
          {visibleParcels} de {totalParcels} lotes visibles
        </p>
        <Button variant="ghost" size="sm" onClick={clear} disabled={!active}>
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
}
