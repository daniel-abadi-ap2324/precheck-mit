"use client";

import { FilePlus2 } from "lucide-react";
import { useProperty } from "@/hooks/use-api";
import { ErrorState, LinkButton, SidePanel, SkeletonRows } from "@/components/common";
import { LotInfo } from "./lot-info";
import { ParcelContext } from "./parcel-context";

interface ParcelInfoPanelProps {
  parcelId: string;
  onClose: () => void;
  /** En escritorio el panel escucha Escape; en la hoja móvil lo gestiona el Sheet. */
  closeOnEscape?: boolean;
}

/** Información del lote seleccionado: ficha de zona literal, fuente, CEUS y acceso a un nuevo PreCheck. */
export function ParcelInfoPanel({ parcelId, onClose, closeOnEscape = true }: ParcelInfoPanelProps) {
  const property = useProperty(parcelId);

  return (
    <SidePanel
      titleId="parcel-info-title"
      title="Información del lote"
      subtitle={parcelId}
      onClose={onClose}
      closeLabel="Cerrar información del lote"
      closeOnEscape={closeOnEscape}
    >
      {property.isLoading ? <SkeletonRows rows={8} /> : null}
      {property.error ? <ErrorState error={property.error} onRetry={() => void property.refetch()} /> : null}
      {property.data ? <LotInfo property={property.data} /> : null}
      {property.data ? <ParcelContext parcel={property.data.parcel} /> : null}
      <LinkButton href={`/projects/new?parcel=${encodeURIComponent(parcelId)}`} className="w-full">
        <FilePlus2 aria-hidden />
        Nuevo PreCheck en este lote
      </LinkButton>
    </SidePanel>
  );
}
