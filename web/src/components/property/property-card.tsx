import { ReviewCallout } from "@/components/common/callout";
import { FactList } from "@/components/common/fact-list";
import { Landmark } from "lucide-react";
import type { Property } from "@/types";
import { formatNumber } from "@/lib/format";
import { etiquetaZona, mensajeSinFicha, PARAMETRO_EN_REVISION } from "@/lib/norma-zona";
import { cn } from "@/lib/utils";

/**
 * Ficha del lote: datos del lote (de demostración o dibujados por el profesional) + parámetros literales de la
 * ficha de zona del PLOT. Sin ficha cargada, dice por qué y deja los parámetros en revisión.
 */
export function PropertyCard({ property, className, showZoning = true }: { property: Property; className?: string; showZoning?: boolean }) {
  const { parcel, zoning, ceus } = property;
  const [lng, lat] = parcel.centroid;
  const declarado = parcel.origen === "declarado";
  const sinFicha = zoning ? null : mensajeSinFicha(property.normaZona, parcel.zoningCode);
  const origen = declarado ? "Lote dibujado por el profesional: no es el catastro de la ANATI." : "Datos catastrales de demostración.";
  return (
    <section aria-label={`Lote ${parcel.id}`} className={cn("flex flex-col gap-4 rounded-lg border bg-card p-4", className)}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{declarado ? "Lote declarado" : "Lote"}</p>
          <p className="tabular font-semibold">{parcel.id}</p>
        </div>
        <span className="rounded-md border bg-muted px-2 py-0.5 text-sm font-medium">{etiquetaZona(zoning?.code ?? parcel.zoningCode)}</span>
      </header>
      <FactList
          labelWidth="fluid"
          tabular
        rows={[
          { label: "Finca", value: parcel.finca },
          { label: "Área", value: `${formatNumber(parcel.areaM2)} m²` },
          { label: "Dirección", value: parcel.address },
          { label: "Corregimiento", value: parcel.corregimiento },
          { label: "Distrito", value: parcel.district },
          { label: "Uso actual", value: parcel.landUse },
          { label: "Coordenadas", value: `${lat.toFixed(5)}, ${lng.toFixed(5)}` },
          { label: "CEUS", value: ceus ?? "Sin certificación: zona tomada del Documento Gráfico" },
          ...(property.zoneSource
            ? [{ label: "Zona según", value: `Documento Gráfico, hoja ${property.zoneSource.hoja} (${property.zoneSource.fecha}), polígono ${property.zoneSource.poligono}` }]
            : []),
        ]}
      />
      {showZoning && zoning ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Landmark aria-hidden className="size-4 text-muted-foreground" />
            {zoning.name}
          </p>
          <FactList
          labelWidth="fluid"
          tabular
            rows={[
              { label: "Densidad máxima", value: zoning.maxDensity },
              { label: "Lote mínimo", value: zoning.minLotArea },
              { label: "Frente mínimo", value: zoning.minFront },
              { label: "Ocupación máxima", value: zoning.maxCoverage },
              { label: "Altura máxima", value: zoning.maxHeight },
              { label: "Acera mínima", value: zoning.minSidewalk },
              { label: "Retiros", value: zoning.setbacks ?? "Según ficha" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {zoning.norma}, ficha {zoning.code}, pág. {zoning.sourcePage}. {origen}
          </p>
        </div>
      ) : null}
      {showZoning && !zoning ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <ReviewCallout>{sinFicha}</ReviewCallout>
          {parcel.zonasLote && parcel.zonasLote.length > 1 ? (
            <p className="text-sm">
              {"Zonas del lote: " + parcel.zonasLote.map((z) => `${z.codigo ?? "sin código"} (${formatNumber(z.pct)} %)`).join(" · ")}
            </p>
          ) : null}
          <FactList
          labelWidth="fluid"
          tabular
            rows={["Densidad máxima", "Lote mínimo", "Frente mínimo", "Ocupación máxima", "Altura máxima", "Retiros"].map((label) => ({
              label,
              value: PARAMETRO_EN_REVISION,
            }))}
          />
          <p className="text-xs text-muted-foreground">{origen}</p>
        </div>
      ) : null}
      {!showZoning && declarado ? <p className="text-xs text-muted-foreground">{origen}</p> : null}
    </section>
  );
}
