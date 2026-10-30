import type { ZoningFamily } from "@/types";
import { zoningFamilyColors, ZONING_FAMILY_ORDER } from "@/config/zoning-colors";
import { baseLayerColors } from "@/config/base-layer-colors";
import { LAND_USE_COLORS } from "../lib/legend";
import { ZONING_MIN_ZOOM } from "@/lib/gis/geo";
import { AreaKey, HatchKey } from "./map-keys";

/** Leyenda de la capa de zonificación por familia de zona (solo las familias presentes en la capa). */
export function ZoningLegend({ present }: { present?: string[] }) {
  const families = ZONING_FAMILY_ORDER.filter((f) => !present || present.includes(f));
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
      <ul aria-label="Leyenda de zonificación" className="flex flex-col gap-1.5 text-xs">
        {families.map((f: ZoningFamily) => {
          const s = zoningFamilyColors[f];
          return (
            <li key={f} className="flex items-center gap-2">
              <AreaKey fill={s.fill} line={s.line} dashed={s.dashed} />
              <span>{s.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Documento Gráfico del PLOT (Anexo 6), referencial. Se cargan las hojas vectorizadas visibles desde el zoom {ZONING_MIN_ZOOM}. Colores por familia, no los de la hoja.
      </p>
    </div>
  );
}

export function LandUseLegend() {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
      <ul aria-label="Leyenda de uso de suelo" className="flex flex-col gap-1.5 text-xs">
        {LAND_USE_COLORS.map((u) => (
          <li key={u.label} className="flex items-center gap-2">
            <AreaKey fill={u.color} line={u.color} />
            {u.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Uso de suelo de los lotes de demostración.</p>
    </div>
  );
}

/** Leyenda de la grilla de hojas: vectorizada frente a pendiente. */
export function SheetsLegend() {
  const c = baseLayerColors.sheets;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
      <ul aria-label="Leyenda de hojas" className="flex flex-col gap-1.5 text-xs">
        <li className="flex items-center gap-2">
          <AreaKey fill={null} line={c.vectorized} />
          Hoja vectorizada
        </li>
        <li className="flex items-center gap-2">
          <HatchKey color={c.pending} />
          Hoja pendiente de vectorizar
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">Índice de hojas de la DPU. Haga clic en una hoja para ver su ficha y el PDF oficial.</p>
    </div>
  );
}
