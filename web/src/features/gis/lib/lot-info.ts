import { mensajeSinFicha, PARAMETRO_EN_REVISION } from "@/lib/norma-zona";
import type { Property } from "@/types";
import { formatNumber } from "@/lib/format";

export interface LotInfoRow {
  label: string;
  value: string;
}

export const SEGUN_FICHA_RETIROS = "Según ficha (ver retiros)";
export const SEGUN_FICHA = "Según ficha";

/**
 * Retiros según la ficha del Anexo 4. La ficha RM-2 solo trae el texto literal «Lo establecido ó 5m»
 * para el retiro frontal; los laterales y el posterior remiten a la ficha. Nunca se completan de memoria.
 */
function setbackRows(setbacks: string | undefined): LotInfoRow[] {
  if (setbacks) {
    return [
      { label: "Retiro frontal", value: setbacks },
      { label: "Retiro lateral", value: SEGUN_FICHA },
      { label: "Retiro posterior", value: SEGUN_FICHA },
    ];
  }
  return ["Retiro frontal", "Retiro lateral", "Retiro posterior"].map((label) => ({ label, value: SEGUN_FICHA_RETIROS }));
}

/** Filas de «Información del lote» con los valores literales de la ficha de zona. */
/** Procedencia de la zona del lote en el Documento Gráfico: «10-3B · Octubre 2023 · polígono DGZ-…». */
export function zoneSourceText({ zoneSource }: Property): string | null {
  if (!zoneSource) return null;
  const code = zoneSource.codigo ? `rótulo ${zoneSource.codigo}, ` : "";
  return `Hoja ${zoneSource.hoja} · ${zoneSource.fecha} · ${code}polígono ${zoneSource.poligono}`;
}

export function buildLotInfo(property: Property): LotInfoRow[] {
  const { parcel, zoning } = property;
  const source = zoneSourceText(property);
  // Sin ficha cargada, los parámetros van a revisión: nunca se toman de otra ficha.
  const orFicha = (v: string | undefined) => (zoning ? (v ?? SEGUN_FICHA_RETIROS) : PARAMETRO_EN_REVISION);
  return [
    { label: "ID del lote", value: parcel.id },
    { label: "Finca", value: parcel.finca },
    { label: "Área", value: `${formatNumber(parcel.areaM2)} m²` },
    { label: "Zonificación", value: zoning?.code ?? (parcel.zoningCode || "Por revisar") },
    ...(source ? [{ label: "Zona según", value: `Documento Gráfico, ${source}` }] : []),
    { label: "Uso de suelo", value: parcel.landUse },
    { label: "Altura máxima", value: orFicha(zoning?.maxHeight) },
    { label: "Ocupación máxima", value: orFicha(zoning?.maxCoverage) },
    { label: "Densidad máxima", value: orFicha(zoning?.maxDensity) },
    ...(zoning ? setbackRows(zoning.setbacks) : [{ label: "Retiros", value: PARAMETRO_EN_REVISION }]),
  ];
}

export function sourceLine({ zoning, normaZona, parcel }: Property): string {
  if (!zoning) return mensajeSinFicha(normaZona, parcel.zoningCode) ?? "";
  return `Fuente: ${zoning.norma}, ficha ${zoning.code}, pág. ${zoning.sourcePage}.`;
}

export function ceusLine({ ceus }: Property): string {
  return ceus
    ? `CEUS: ${ceus}. La certificación de uso de suelo prevalece sobre el Documento Gráfico.`
    : "Sin CEUS: la zona se toma del Documento Gráfico (referencial). Si el expediente trae CEUS de la DPUOT, esta prevalece.";
}
