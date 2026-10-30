import type { ZonePolygon, Zoning } from "@/types";
import { zoningFamilyColors } from "@/config/zoning-colors";
import { formatNumber } from "@/lib/format";
import { isDualLabel, zoneNorm, type ZoneNorm } from "@/lib/gis/zona";

export { isDualLabel, zoneNorm, type ZoneNorm };

export const MSG_MIVIOT = "Norma del MIVIOT no cargada: los resultados que dependan de esta zona van a revisión.";
export const MSG_REVISION = "Polígono sin código único en la hoja: requiere revisión.";
export const MSG_REFERENCIAL =
  "La DPU publica las hojas del Documento Gráfico «sólo a manera de referencia». Si el expediente trae certificación de uso de suelo (CEUS) de la DPUOT, esta prevalece.";

export interface ZoneRow {
  label: string;
  value: string;
}

export function zoneRows(zone: ZonePolygon): ZoneRow[] {
  return [
    { label: "Código en la hoja", value: zone.codigo ?? (zone.codigos.length > 1 ? zone.codigos.join(" · ") : "Sin código") },
    { label: "Código de ficha", value: zone.codigo_ficha ?? "—" },
    { label: "Familia", value: zoningFamilyColors[zone.familia]?.label ?? zone.familia },
    { label: "Hoja", value: `${zone.hoja} · ${zone.fecha_hoja}` },
    { label: "Área", value: `${formatNumber(Math.round(zone.area_m2))} m²` },
    { label: "Estado", value: ESTADO_LABEL[zone.estado] },
    { label: "Polígono", value: zone.id },
  ];
}

const ESTADO_LABEL: Record<ZonePolygon["estado"], string> = {
  ok: "Código único",
  sin_etiqueta: "Sin código dentro del polígono",
  conflicto: "Más de un código",
};

export function fichaRows(z: Zoning): ZoneRow[] {
  const v = (x: string | undefined) => x ?? "Según ficha";
  return [
    { label: "Densidad máxima", value: v(z.maxDensity) },
    { label: "Lote mínimo", value: v(z.minLotArea) },
    { label: "Frente mínimo", value: v(z.minFront) },
    { label: "Ocupación máxima", value: v(z.maxCoverage) },
    { label: "Altura máxima", value: v(z.maxHeight) },
    { label: "Acera mínima", value: v(z.minSidewalk) },
    { label: "Retiros", value: v(z.setbacks) },
  ];
}

/** Rótulos dobles «1P / 1ZM6» = uso actual / uso futuro (Acuerdo 270 de 2025, Art. 3). */
