"use client";

import { useMemo, useState } from "react";
import { MapViewer } from "@/components/map";
import { PropertyCard } from "@/components/property";
import { ErrorState, SkeletonRows } from "@/components/common";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useProject, useProperty } from "@/hooks/use-api";
import { useGisLayer } from "@/hooks/use-gis";
import { useViewportZoning } from "@/features/gis/hooks/use-viewport-zoning";
import { esIdDeExpediente } from "@/services/expedientes/cliente";
import { ExpedienteSite } from "../expediente/expediente-site";

/** /projects/[id]/site — mapa del lote con zonificación + ficha del lote; en un expediente real, el lote leído del plano. */
export function ProjectSite({ projectId }: { projectId: string }) {
  return esIdDeExpediente(projectId) ? <ExpedienteSite projectId={projectId} /> : <DemoSite projectId={projectId} />;
}

function DemoSite({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const parcelId = project.data?.parcelId;
  const property = useProperty(parcelId);
  const parcels = useGisLayer("parcels");
  // Zonificación de las hojas vectorizadas que cortan la vista (desde zoom 13).
  const zoning = useViewportZoning();
  const [showZoning, setShowZoning] = useState(true);
  const layers = useMemo(() => ({ basemap: true, parcels: true, zoning: showZoning }), [showZoning]);

  const error = project.error ?? parcels.error;
  if (error) return <ErrorState error={error} onRetry={() => void project.refetch()} className="m-4 md:m-6" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative flex min-h-map-sm flex-1 flex-col p-4 md:p-6 lg:pr-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Ubicación del lote</h2>
          <div className="flex items-center gap-2">
            <Switch id="capa-zonificacion" checked={showZoning} onCheckedChange={setShowZoning} />
            <Label htmlFor="capa-zonificacion" className="text-sm font-normal">
              Zonificación
            </Label>
          </div>
        </div>
        <MapViewer
          className="min-h-map-sm flex-1"
          parcels={parcels.data}
          zoning={zoning.zoning}
          onViewportChange={zoning.onViewportChange}
          visibleLayers={layers}
          selectedParcelId={parcelId ?? null}
          center={property.data?.parcel.centroid}
          ariaLabel={`Mapa del lote ${parcelId ?? ""} con zonificación`}
        />
        <p className="mt-2 text-xs text-muted-foreground">Lotes de demostración sobre la zonificación del Documento Gráfico del PLOT (referencial; la CEUS prevalece). El lote del proyecto se resalta en magenta.</p>
      </div>
      <aside aria-label="Ficha del lote" className="border-t p-4 md:p-6 lg:w-panel-lg lg:overflow-y-auto lg:border-t-0 lg:border-l">
        {!parcelId && !project.isPending ? (
          <p className="text-sm text-muted-foreground">El proyecto no tiene un lote asociado.</p>
        ) : property.isPending ? (
          <SkeletonRows rows={10} />
        ) : property.error || !property.data ? (
          <ErrorState error={property.error} onRetry={() => void property.refetch()} />
        ) : (
          <PropertyCard property={property.data} />
        )}
      </aside>
    </div>
  );
}
