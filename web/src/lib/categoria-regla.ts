import type { RuleCategory } from "@/types";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Palabras clave (sin tildes, en mayúsculas) → categoría. El orden importa: gana la primera que coincide. */
const CLAVES: [RegExp, RuleCategory][] = [
  [/RETIRO|ADOSAMIENTO|LINEA DE CONSTRUCCION/, "setbacks"],
  [/ALTURA|PISOS|NIVELES|\bALT\b/, "height"],
  [/OCUPACION|COBERTURA|\bCOS\b|\bCAS\b|EDIFICABILIDAD|\bFAR\b/, "coverage"],
  [/DENSIDAD/, "density"],
  [/ESTACIONAMIENTO|PARKING|ABASTO/, "parking"],
  [/ACCESIB|RAMPA|DISCAPACI/, "accessibility"],
  [/VERDE|SUPERFICIE[- ]SUAVE|PERMEABLE|ARBOL|PAISAJ|CAPA[- ]VEGETAL/, "landscaping"],
  [/\bUSOS?\b|ZONIFICACION|COMPATIBILIDAD/, "zoning"],
  [/LOTE|FRENTE|FONDO|FINCA|ACERA|CURVAS|SERVIDUMBRE|CERCA/, "site"],
];

/**
 * Categoría aproximada de una regla por palabras clave de su id y, si no basta, de su título. Solo sirve para
 * agrupar y filtrar; no cambia cómo se evalúa la regla.
 */
export function categoriaDeRegla(id: string, titulo?: string | null): RuleCategory {
  for (const texto of [id.replace(/-/g, " "), titulo ?? ""]) {
    const t = sinTildes(texto);
    const hit = CLAVES.find(([re]) => re.test(t));
    if (hit) return hit[1];
  }
  return "other";
}
