"use client";

import { Info } from "lucide-react";
import { useZonings } from "@/hooks/use-api";
import { ErrorState, FactList, ReviewCallout, SidePanel, SkeletonRows } from "@/components/common";
import type { ZonePolygon } from "@/types";
import { zoningFamilyColors } from "@/config/zoning-colors";
import { fichaRows, isDualLabel, MSG_MIVIOT, MSG_REFERENCIAL, MSG_REVISION, zoneNorm, zoneRows } from "../lib/zone-info";
import { AreaKey } from "./map-keys";

interface ZoneInfoPanelProps {
  zone: ZonePolygon;
  onClose: () => void;
  closeOnEscape?: boolean;
}

/** Información de un polígono del Documento Gráfico: rótulo, procedencia y, si hay, la ficha del Anexo 4. */
export function ZoneInfoPanel({ zone, onClose, closeOnEscape = true }: ZoneInfoPanelProps) {
  const zonings = useZonings();
  const style = zoningFamilyColors[zone.familia];

  const norm = zonings.data ? zoneNorm(zone, zonings.data) : null;

  return (
    <SidePanel
      titleId="zone-info-title"
      title="Información de la zona"
      subtitle={
        <>
          {style ? <AreaKey fill={style.fill} line={style.line} dashed={style.dashed} /> : null}
          <span className="truncate">{zone.codigo ?? "Sin código"}</span>
        </>
      }
      onClose={onClose}
      closeLabel="Cerrar información de la zona"
      closeOnEscape={closeOnEscape}
    >

      <FactList rows={zoneRows(zone)} label="Polígono del Documento Gráfico" labelWidth="fluid" tabular />

      {zonings.error ? <ErrorState error={zonings.error} onRetry={() => void zonings.refetch()} /> : !norm ? <SkeletonRows rows={4} /> : null}
      {norm?.kind === "ficha" ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-sm font-medium">
            Ficha {norm.zoning.code} · {norm.zoning.name}
          </p>
          {isDualLabel(zone) ? (
            <ReviewCallout>{`Rótulo doble (uso actual / uso futuro). Se muestra la ficha ${zone.codigo_ficha}; el revisor confirma la norma aplicable.`}</ReviewCallout>
          ) : null}
          <FactList rows={fichaRows(norm.zoning)} label={`Parámetros de la ficha ${norm.zoning.code}`} labelWidth="fluid" tabular />
          <p className="text-xs text-muted-foreground">
            Fuente: {norm.zoning.norma}, ficha {norm.zoning.code}, pág. {norm.zoning.sourcePage}. Valores literales de la ficha.
          </p>
        </div>
      ) : null}
      {norm?.kind === "ficha_no_cargada" ? <ReviewCallout>{`La ficha ${norm.code} del Anexo 4 no está cargada en esta demostración.`}</ReviewCallout> : null}
      {norm?.kind === "anexo5" ? <ReviewCallout>{`El código ${norm.code} se rige por la matriz del Anexo 5 del PLOT, que no está cargada en esta demostración.`}</ReviewCallout> : null}
      {norm?.kind === "miviot" ? <ReviewCallout>{MSG_MIVIOT}</ReviewCallout> : null}
      {norm?.kind === "revision" ? <ReviewCallout>{MSG_REVISION}</ReviewCallout> : null}

      <p className="flex gap-2 rounded-md border bg-muted px-2.5 py-2 text-xs">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span>{MSG_REFERENCIAL}</span>
      </p>
    </SidePanel>
  );
}
