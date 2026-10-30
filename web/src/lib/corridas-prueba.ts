/**
 * Corridas de prueba de modelos: proyectos que crea una ronda de comparación, no trámites del usuario.
 *
 * Nombre (lo escribe scripts/lote_ia.py; su par en Python es scripts/analisis/nombres.py):
 *   «<Plano> - prueba <N> con <Modelo>»        repetición 1
 *   «<Plano> - prueba <N> con <Modelo> (k)»    repetición k ≥ 2 (ADR-0015)
 * Las primeras rondas no llevan número («prueba con …» = ronda 1), y algunas se llamaron «<Plano> - IA <Modelo>»
 * (también ronda 1, como en desacuerdos.py).
 */

export interface NombrePrueba {
  plano: string;
  ronda: number;
  modelo: string;
  repeticion: number;
}

const NOMBRE = /^(.+?) - (?:IA|prueba(?: (\d+))? con) (.+?)(?: \((\d+)\))?$/i;
const MODELO = String.raw`(?:Haiku|Sonnet|Opus|Fable|DeepSeek)(?: Flash)?(?: [\d.]+)?`;
/** Variantes a mano de los primeros días: «Bella Vista - IA Opus 5.5», «Casco Antiguo - manual 2 con Opus 5.5», «Casco antiguo prueba Fable 5.1». */
const VARIANTES = [
  new RegExp(String.raw` - IA (?:con )?${MODELO}$`, "i"),
  new RegExp(String.raw`\bprueba\b.*\b${MODELO}$`, "i"),
  new RegExp(String.raw` con ${MODELO}(?: \(\d+\))?$`, "i"),
];

/** Plano, ronda, modelo y repetición de un nombre de corrida de prueba; null si no sigue el formato. */
export function leerNombrePrueba(nombre: string): NombrePrueba | null {
  const m = NOMBRE.exec(nombre.trim());
  if (!m) return null;
  return { plano: m[1].trim(), ronda: m[2] ? Number(m[2]) : 1, modelo: m[3].trim(), repeticion: m[4] ? Number(m[4]) : 1 };
}

/** Nombre de una corrida de prueba; la repetición 1 no lleva sufijo, así los nombres anteriores siguen valiendo. */
export const nombreDePrueba = ({ plano, ronda, modelo, repeticion }: NombrePrueba): string =>
  `${plano} - prueba ${ronda} con ${modelo}${repeticion > 1 ? ` (${repeticion})` : ""}`;

/** ¿El nombre es el de una corrida de prueba (formato de lote_ia o las variantes a mano)? */
export const esNombreDePrueba = (nombre: string): boolean => NOMBRE.test(nombre.trim()) || VARIANTES.some((r) => r.test(nombre.trim()));

/** Corrida de prueba: marcada al crearla (`esPrueba`) o, en las anteriores a la marca, reconocida por el nombre. */
export const esCorridaDePrueba = (p: { name: string; esPrueba?: boolean }): boolean => p.esPrueba === true || esNombreDePrueba(p.name);

/**
 * Catálogo de severidad con que se evaluó una ronda (ADR-0014): los conteos de «no cumple» de etapas distintas no
 * se comparan directo. Hasta la 56, los requisitos del plano eran «No cumple»; de la 57 a la 76, «Observación»;
 * desde la 77, «No cumple · falta en el plano».
 */
export type EtapaSeveridad = "hasta-56" | "57-76" | "desde-77";
export const etapaDeSeveridad = (ronda: number): EtapaSeveridad => (ronda <= 56 ? "hasta-56" : ronda <= 76 ? "57-76" : "desde-77");

/** Nombre corto de cada modelo (el id es el de web/src/server/ia/config.ts). */
export const NOMBRE_MODELO: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-opus-5-5": "Opus 5.5",
  "claude-fable-5-1": "Fable 5.1",
  "deepseek-flash": "DeepSeek Flash",
};

/**
 * Modelo para mostrar: si la revisión se enrutó (plano escaneado), el que corrió de verdad (`ia.modelo`) con
 * «(enrutado)», igual que en rondas.py. Las corridas del enrutamiento del 19-oct guardaban Sonnet en `ia.modelo`.
 */
export const etiquetaModelo = (modelo: string, ia?: { enrutado?: unknown; modelo?: unknown } | null): string =>
  ia?.enrutado ? `${typeof ia.modelo === "string" ? (NOMBRE_MODELO[ia.modelo] ?? ia.modelo) : "Sonnet 5.5"} (enrutado)` : modelo;
