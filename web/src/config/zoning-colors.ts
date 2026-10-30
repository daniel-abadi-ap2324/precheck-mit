import type { ZoningFamily } from "@/types";

/**
 * Simbología de la capa de zonificación por FAMILIA de zona (no son los colores oficiales del Documento
 * Gráfico). Tonos apagados, distinguibles entre sí y con daltonismo (basados en Okabe-Ito); el relleno se
 * dibuja semitransparente para que se lean las calles del mapa base.
 */
export interface ZoningFamilyStyle {
  label: string;
  /** Relleno; null = sin relleno (solo contorno discontinuo). */
  fill: string | null;
  line: string;
  dashed?: boolean;
}

export const zoningFamilyColors: Record<ZoningFamily, ZoningFamilyStyle> = {
  residencial: { label: "Residencial", fill: "#e8d36a", line: "#a8912a" },
  residencial_alta: { label: "Residencial de alta densidad", fill: "#e39a3b", line: "#a4661a" },
  mixta: { label: "Zona mixta", fill: "#a58bd0", line: "#6f559f" },
  comercial: { label: "Comercial", fill: "#4f8fc9", line: "#2c6399" },
  espacio_publico: { label: "Espacio público (parques, plazas)", fill: "#5fb58c", line: "#2f7f5a" },
  equipamiento: { label: "Equipamiento e infraestructura", fill: "#9aa7b8", line: "#5f6d80" },
  proteccion: { label: "Suelo de protección", fill: "#7c9a3c", line: "#4e6a1c" },
  urbanizable: { label: "Suelo urbanizable", fill: "#d2bf9a", line: "#94805a" },
  miviot: { label: "Norma del MIVIOT (sin ficha del PLOT)", fill: "#c9a5b4", line: "#8a5d70" },
  otro: { label: "Otro", fill: "#c4c4c4", line: "#8a8a8a" },
  sin_etiqueta: { label: "Sin código en la hoja", fill: null, line: "#7d8590", dashed: true },
  conflicto: { label: "Código en conflicto", fill: null, line: "#d4183d", dashed: true },
};

/** Orden de la leyenda y de los filtros. */
export const ZONING_FAMILY_ORDER: ZoningFamily[] = [
  "residencial",
  "residencial_alta",
  "mixta",
  "comercial",
  "espacio_publico",
  "equipamiento",
  "proteccion",
  "urbanizable",
  "miviot",
  "otro",
  "sin_etiqueta",
  "conflicto",
];

/** Colores por código de ficha (página de zonificación). Derivados de la familia de cada ficha. */
export const zoningColors: Record<string, string> = {
  R2: zoningFamilyColors.residencial.fill as string,
  R6: zoningFamilyColors.residencial.fill as string,
  RM: "#e8b15e",
  "RM-1": "#e39a3b",
  "RM-2": "#cf8027",
  "RM-3": "#b0691b",
  ZM5: "#bba6dc",
  ZM6: "#a58bd0",
  ZM7: "#8f73c0",
  ZM8: "#7a5eae",
  CU: zoningFamilyColors.comercial.fill as string,
};
