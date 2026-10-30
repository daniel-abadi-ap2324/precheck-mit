/**
 * Simbología de las capas base del índice del Documento Gráfico (DPU). Misma fuente para el MapViewer y las
 * claves de la leyenda.
 */
export const baseLayerColors = {
  ocean: { fill: "#bcd7ea", line: "#8fb7d6" },
  district: { line: "#1f3a8a", halo: "#ffffff", mask: "#1a2230" },
  corregimientos: { line: "#4b3f6b", label: "#3f355c" },
  rivers: { line: "#3f86c6" },
  sheets: { vectorized: "#0046ef", pending: "#8a929e", label: "#3a4250" },
  /** Lotes: relleno claro y contorno de tinta; los declarados usan el color de cota (--mp-dimension). */
  parcels: { fill: "#ffffff", line: "#1a1a1a" },
} as const;

/**
 * Resto de la simbología del mapa. MapLibre no lee variables CSS, así que los colores que repiten un token de
 * tokens.css se copian aquí y una prueba (base-layer-colors.test.ts) comprueba que sigan iguales.
 */
export const mapColors = {
  brand: "#0046ef",
  dimension: "#b0226b",
  ink: "#1a1a1a",
  /** Infraestructura: el mismo color que su clave en la leyenda (border-processing). */
  processing: "#0e7490",
  white: "#ffffff",
  /** Fondo del mapa mientras carga el mapa base. */
  paper: "#f2f3f0",
  /** Rótulos de zona y halo blanco para leerlos sobre cualquier fondo. */
  labelText: "#1f2933",
  halo: "rgba(255,255,255,0.92)",
  /** Polígono de zona de una familia sin color propio. */
  zoningFallbackFill: "#c4c4c4",
  zoningFallbackLine: "#8a8a8a",
  /** Relleno de las familias sin relleno (se dibujan con opacidad 0). */
  zoningNoFill: "#000000",
} as const;

/** Colores de mapColors que son copia de un token --mp-* de tokens.css. */
export const mapColorTokens: Partial<Record<keyof typeof mapColors, string>> = {
  brand: "--mp-brand",
  dimension: "--mp-dimension",
  ink: "--mp-ink",
  processing: "--mp-processing",
  white: "--mp-sheet",
};
