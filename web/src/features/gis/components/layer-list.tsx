"use client";

import { Map as MapIcon } from "lucide-react";
import type { MapLayerKey } from "@/components/map";
import { Checkbox } from "@/components/ui/checkbox";
import { zoningFamilyColors } from "@/config/zoning-colors";
import { baseLayerColors } from "@/config/base-layer-colors";
import { useGisStore } from "../store";
import { coverageText, LAND_USE_COLORS, LAYER_LABELS, LAYER_ORDER } from "../lib/legend";
import { LandUseLegend, SheetsLegend, ZoningLegend } from "./legends";
import { AreaKey, LineKey, PointKey, StripeKey, StrokeKey } from "./map-keys";

/** Clave visual de cada capa: va a la derecha de la etiqueta para no confundirse con la casilla. */
function LayerKey({ layer }: { layer: MapLayerKey }) {
  switch (layer) {
    case "basemap":
      return <MapIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
    case "boundary":
      return <AreaKey fill={baseLayerColors.ocean.fill} line={baseLayerColors.district.line} />;
    case "corregimientos":
      return <StrokeKey color={baseLayerColors.corregimientos.line} dashed width={1.5} />;
    case "rivers":
      return <StrokeKey color={baseLayerColors.rivers.line} />;
    case "sheets":
      return <AreaKey fill={null} line={baseLayerColors.sheets.vectorized} />;
    case "zoning":
      return (
        <StripeKey colors={[zoningFamilyColors.residencial_alta.fill, zoningFamilyColors.mixta.fill, zoningFamilyColors.espacio_publico.fill].map(String)} />
      );
    case "parcels":
      return <AreaKey fill={baseLayerColors.parcels.fill} line={baseLayerColors.parcels.line} />;
    case "landUse":
      return <StripeKey colors={LAND_USE_COLORS.slice(0, 3).map((u) => u.color)} />;
    case "projects":
      return <PointKey className="bg-brand" />;
    case "infrastructure":
      return <LineKey className="border-processing" />;
  }
}

/** Capas del mapa: casilla + nombre + clave de leyenda. */
export function LayerList({ zoningFamilies, coverage }: { zoningFamilies?: string[]; coverage?: { vectorized: number | null; total: number } }) {
  const layers = useGisStore((s) => s.layers);
  const toggle = useGisStore((s) => s.toggleLayer);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {LAYER_ORDER.map((layer) => (
          <li key={layer} className="flex flex-col gap-2">
            <label className="flex min-h-6 cursor-pointer items-center gap-2.5 text-sm pointer-coarse:min-h-11">
              <Checkbox checked={layers[layer]} onCheckedChange={() => toggle(layer)} />
              <span className="min-w-0 flex-1">{LAYER_LABELS[layer]}</span>
              <LayerKey layer={layer} />
            </label>
            {layer === "sheets" && layers.sheets ? <SheetsLegend /> : null}
            {layer === "zoning" && layers.zoning ? <ZoningLegend present={zoningFamilies} /> : null}
            {layer === "landUse" && layers.landUse ? <LandUseLegend /> : null}
          </li>
        ))}
      </ul>
      {coverage ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Cobertura: </span>
          {coverage.vectorized === null ? "cargando índice…" : coverageText(coverage.vectorized, coverage.total)}
        </p>
      ) : null}
    </div>
  );
}
