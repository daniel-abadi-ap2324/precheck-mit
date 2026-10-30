import type { MapLayerKey } from "@/components/map";
import { landUseColors, LAND_USE_DEFAULT } from "@/config/land-use-colors";

/** Leyenda de uso de suelo: misma fuente que el MapViewer (src/config/land-use-colors.ts). */
export const LAND_USE_COLORS: { label: string; color: string }[] = [
  ...Object.entries(landUseColors).map(([label, color]) => ({ label, color })),
  { label: "Residencial y otros", color: LAND_USE_DEFAULT },
];

export const LAYER_LABELS: Record<MapLayerKey, string> = {
  basemap: "Mapa base",
  boundary: "Océano y límite distrital",
  corregimientos: "Corregimientos",
  rivers: "Ríos",
  sheets: "Hojas del Documento Gráfico",
  zoning: "Zonificación",
  parcels: "Lotes (demostración y declarados)",
  landUse: "Uso de suelo",
  projects: "Proyectos",
  infrastructure: "Infraestructura",
};

export const LAYER_ORDER: MapLayerKey[] = ["basemap", "boundary", "corregimientos", "rivers", "sheets", "zoning", "parcels", "landUse", "projects", "infrastructure"];

/** Hojas del índice del Documento Gráfico (Anexo 6 del PLOT) cuando el mosaico aún no ha cargado. */
export const DGZ_TOTAL_SHEETS = 78;

/** «12 de 78 hojas vectorizadas». */
export function coverageText(vectorized: number, total: number): string {
  return `${vectorized} de ${total} ${total === 1 ? "hoja vectorizada" : "hojas vectorizadas"}`;
}

/** «Zonificación: 2 hojas cargadas». */
export function loadedSheetsText(n: number): string {
  return `Zonificación: ${n} ${n === 1 ? "hoja cargada" : "hojas cargadas"}`;
}
