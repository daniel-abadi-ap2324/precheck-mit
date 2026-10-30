import { textoDeAviso } from "./avisos";

/**
 * Avisos del motor que dicen que la zona evaluada no es la que escribió el profesional, que no existe en la norma o con
 * qué zona de trabajo se evaluó (ADR-0016).
 */
export const esAvisoDeZona = (aviso: string) =>
  aviso.startsWith("ZONA_DISCREPANTE") || aviso.startsWith("ZONA_TRABAJO") || /no existe en la norma|no lo reconoce, tal como está escrito/.test(aviso);

/** Quita el prefijo técnico: «ZONA_DISCREPANTE: la zona usada…» → «La zona usada…». */
export const textoAvisoDeZona = (aviso: string): string => textoDeAviso(aviso);
