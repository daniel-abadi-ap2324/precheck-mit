import type { TipoRegion } from "@/types";

/**
 * Colores fijos por tipo de región del plano (contrato del flujo de 3 pasos: los mismos en el editor, el reporte visual
 * y Python). Son la única excepción a los tokens de la interfaz: identifican el tipo, no un estado.
 */
export const coloresRegion: Record<TipoRegion, string> = {
  lote: "#2563eb",
  huella: "#dc2626",
  retiro_frontal: "#f59e0b",
  retiro_lateral: "#d97706",
  retiro_posterior: "#b45309",
  estacionamiento: "#7c3aed",
  acera: "#6b7280",
  area_verde: "#16a34a",
  tinaquera: "#92400e",
  acceso_vehicular: "#0891b2",
  escalera_rampa: "#db2777",
  otro: "#64748b",
};

/** Colores del PNG exportado (canvas: no lee los tokens CSS) y del relleno de los vértices en el editor. */
export const coloresExportacionRegiones = {
  fondo: "#ffffff",
  texto: "#111827",
  textoSuave: "#4b5563",
  vertice: "#ffffff",
};
