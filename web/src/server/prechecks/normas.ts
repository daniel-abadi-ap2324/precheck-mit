/**
 * Normas que reconoce el motor (precheck/reglas/normas.json). Un test compara esta lista con ese archivo: si el
 * motor agrega una norma, la prueba avisa.
 */
export const NORMAS: { codigo: string; nombre: string }[] = [
  { codigo: "A110-2025", nombre: "Acuerdo N°110 de 22-04-2025" },
  { codigo: "PLOT-A61-2021", nombre: "PLOT, Acuerdo 61 de 2021" },
  { codigo: "PLOT-A61-2021+A270-2025", nombre: "PLOT con el Acuerdo 270 de 2025 (San Francisco)" },
  { codigo: "MIVIOT", nombre: "Normas del MIVIOT para zonas exceptuadas (sin reglas cargadas)" },
  { codigo: "MIVIOT-CA-R127-2003", nombre: "Casco Antiguo, Resolución N°127-2003 (ZOT-E1)" },
  { codigo: "MIVIOT-PV-R352-2006", nombre: "Panamá Viejo, Resolución N°352-2006 (ZOT-E2)" },
  { codigo: "LEY21-1997", nombre: "Ley 21 de 1997, Plan General del Área del Canal (ZOT-E3)" },
  { codigo: "MIVIOT-AC-R160-2002", nombre: "Área del Canal, Resolución N°160-2002 del MIVI" },
  { codigo: "MIVIOT-CDE", nombre: "Normas Especiales de Costa del Este (ZOT-E6)" },
  { codigo: "MIVIOT-ML1", nombre: "Plan Parcial del Polígono de Influencia de la Línea 1 del Metro (ZOT-E7)" },
  { codigo: "MIVIOT-ML2", nombre: "Plan Parcial del Polígono de Influencia de la Línea 2 del Metro (ZOT-E8)" },
  { codigo: "MIVIOT-LC-R15-1992", nombre: "La Cresta, Resolución N°15-1992" },
  { codigo: "MIVIOT-EC-R192-2013", nombre: "El Carmen, Resolución N°192-2013 (ZOT-E9)" },
];
export const esNormaConocida = (codigo: string) => NORMAS.some((n) => n.codigo === codigo);
