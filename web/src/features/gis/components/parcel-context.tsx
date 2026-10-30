"use client";

import { ErrorState, ReviewCallout } from "@/components/common";
import { pdfDeLaDpu } from "@/lib/safe-url";
import { useMemo } from "react";
import { ExternalLink, Waves } from "lucide-react";
import type { Parcel } from "@/types";
import { useGisLayer } from "@/hooks/use-gis";
import { corregimientoAtPoint, nearestLineDistance, sheetAtPoint } from "@/lib/gis/geo";
import { formatDistance, riverWarning } from "../lib/parcel-context";

/** Contexto territorial del lote: hoja del Documento Gráfico que lo contiene y distancia al río más cercano. */
export function ParcelContext({ parcel }: { parcel: Parcel }) {
  const mosaico = useGisLayer("sheets");
  const rivers = useGisLayer("rivers");
  const corregimientos = useGisLayer("corregimientos");
  const corregimiento = useMemo(
    () => (corregimientos.data ? corregimientoAtPoint(corregimientos.data, parcel.centroid) : null),
    [corregimientos.data, parcel.centroid],
  );
  const sheet = useMemo(() => (mosaico.data ? sheetAtPoint(mosaico.data, parcel.centroid) : null), [mosaico.data, parcel.centroid]);
  const river = useMemo(() => (rivers.data ? nearestLineDistance(parcel.geometry, rivers.data, parcel.centroid) : null), [rivers.data, parcel]);
  const warning = riverWarning(river?.distanceM);
  const pdf = pdfDeLaDpu(sheet?.pdf);

  return (
    <div className="flex flex-col gap-2 border-t pt-3 text-sm">
      <p>
        <span className="text-muted-foreground">Corregimiento: </span>
        {corregimientos.isPending ? (
          <span className="text-muted-foreground">cargando…</span>
        ) : corregimientos.isError ? (
          <ErrorState variant="inline" message="no se pudo cargar la capa" onRetry={() => void corregimientos.refetch()} />
        ) : corregimiento ? (
          <>
            <span className="font-medium">{corregimiento.nombre}</span>
            <span className="text-muted-foreground"> (capa distrito8v4)</span>
          </>
        ) : (
          <span className="text-muted-foreground">fuera de los límites del distrito</span>
        )}
      </p>
      <p>
        <span className="text-muted-foreground">Hoja del Documento Gráfico: </span>
        {mosaico.isPending ? (
          <span className="text-muted-foreground">cargando…</span>
        ) : mosaico.isError ? (
          <ErrorState variant="inline" message="no se pudo cargar la capa" onRetry={() => void mosaico.refetch()} />
        ) : sheet ? (
          <>
            <span className="tabular font-medium">{sheet.hoja}</span>
            {sheet.escala ? <span className="tabular"> ({sheet.escala})</span> : null}
            {pdf ? (
              <>
                {" · "}
                <a href={pdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">
                  Ver PDF
                  <ExternalLink aria-hidden className="size-3.5" />
                  <span className="sr-only"> de la hoja {sheet.hoja} (se abre en una pestaña nueva)</span>
                </a>
              </>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">fuera del índice de hojas</span>
        )}
      </p>
      {warning ? (
        <ReviewCallout>{warning}. Es una marca para el revisor, no un incumplimiento.</ReviewCallout>
      ) : river ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Waves aria-hidden className="size-4 shrink-0" />
          <span>Río más cercano a {formatDistance(river.distanceM)} (capa de ríos de la DPU, referencial).</span>
        </p>
      ) : null}
    </div>
  );
}
