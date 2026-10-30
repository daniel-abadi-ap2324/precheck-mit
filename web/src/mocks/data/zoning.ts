import type { Zoning } from "@/types";

/**
 * Fichas del Anexo 4 del PLOT (Acuerdo 61 de 2021), tomadas de normativa/zonificacion/codigos-zona.md.
 * Valores literales de la ficha; no se completan de memoria.
 */
const NORMA = "PLOT-A61-2021 · Anexo 4";

export const zonings: Zoning[] = [
  { code: "R2", name: "Residencial de baja densidad", norma: NORMA, maxDensity: "100 pers/ha", minLotArea: "800 m²", minFront: "20 m", maxCoverage: "50% (huella)", maxHeight: "PB + 2 pisos", maxFloors: 3, minSidewalk: "1.20 m", sourcePage: 3 },
  { code: "R6", name: "Residencial multifamiliar de mediana densidad", norma: NORMA, maxDensity: "600 pers/ha", minLotArea: "600 m²", minFront: "16 m", maxCoverage: "80% o según retiros en PB", maxHeight: "4 pisos", maxFloors: 4, minSidewalk: "3.00 m", sourcePage: 7 },
  { code: "RM", name: "Residencial multifamiliar de alta densidad", norma: NORMA, maxDensity: "1,000 pers/ha", minLotArea: "600 m²", minFront: "16 m", maxCoverage: "80% o según retiros en PB+1", maxHeight: "10 pisos", maxFloors: 10, minSidewalk: "3.00 m", sourcePage: 9 },
  { code: "RM-1", name: "Residencial multifamiliar de alta densidad", norma: NORMA, maxDensity: "1,200 pers/ha", minLotArea: "600 m²", minFront: "20 m", maxCoverage: "80% o según retiros en PB+2", maxHeight: "20 pisos", maxFloors: 20, minSidewalk: "5.00 m", sourcePage: 10 },
  { code: "RM-2", name: "Residencial multifamiliar de alta densidad", norma: NORMA, maxDensity: "1,500 pers/ha", minLotArea: "800 m²", minFront: "20 m", maxCoverage: "80% o según retiros en PB+3", maxHeight: "40 pisos", maxFloors: 40, minSidewalk: "5.00 m", setbacks: "Lo establecido ó 5m", sourcePage: 11 },
  { code: "RM-3", name: "Residencial multifamiliar de alta densidad", norma: NORMA, maxDensity: "2,000 pers/ha", minLotArea: "800 m²", minFront: "20 m", maxCoverage: "80% o según retiros en PB+4", maxHeight: "80 pisos", maxFloors: 80, minSidewalk: "5.00 m", sourcePage: 12 },
  { code: "ZM5", name: "Zona mixta de mediana intensidad", norma: NORMA, maxDensity: "1,500 pers/ha", minLotArea: "600 m²", minFront: "16 m", maxCoverage: "80% o según retiros en PB+1", maxHeight: "10 pisos", maxFloors: 10, minSidewalk: "5.00 m", sourcePage: 17 },
  { code: "ZM6", name: "Zona mixta de mediana intensidad", norma: NORMA, maxDensity: "2,000 pers/ha", minLotArea: "600 m²", minFront: "16 m", maxCoverage: "80% o según retiros en PB+2", maxHeight: "15 pisos", maxFloors: 15, minSidewalk: "5.00 m", sourcePage: 18 },
  { code: "ZM7", name: "Zona Mixta De Alta Intensidad", norma: NORMA, maxDensity: "2,000 pers/ha", minLotArea: "600 m2", minFront: "20 m", maxCoverage: "80% o según retiros en PB+2", maxHeight: "20 pisos", maxFloors: 20, minSidewalk: "5.00m", sourcePage: 19 },
  { code: "ZM8", name: "Zona Mixta De Alta Intensidad", norma: NORMA, maxDensity: "2,000 pers/ha", minLotArea: "800 m2", minFront: "20 m", maxCoverage: "80% o según retiros en PB+3", maxHeight: "40 pisos", maxFloors: 40, minSidewalk: "5.00m", sourcePage: 20 },
  { code: "CU", name: "Comercial urbano", norma: NORMA, minLotArea: "1,000 m²", minFront: "20 m", maxCoverage: "60%", maxHeight: "PB + 2 pisos", maxFloors: 3, minSidewalk: "Según categorización vial vigente", sourcePage: 23 },
];

