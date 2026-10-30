/**
 * Avisos del motor en lenguaje llano (ADR-0016: se muestran siempre, también en el informe). El motor los escribe con
 * un prefijo técnico («ZONA_TRABAJO:», «DATO_DUDOSO:»…) que leen otros programas; a la persona se le quita el prefijo y
 * las referencias internas.
 */
const PREFIJO = /^[A-Z][A-Z0-9_]{3,}:\s*/;

const INTERNO: [RegExp, string][] = [
  [/\s*\(no aparece en ningún aplica_si de sus reglas\)/g, ""],
  [/precheck\/reglas\/normas\.json/g, "el catálogo de normas"],
  [/\blote\.norma_aplicable\b/g, "la norma aplicable"],
  [/\blote\.codigo_zona\b/g, "el código de zona"],
];

export function textoDeAviso(aviso: string): string {
  let t = aviso.replace(PREFIJO, "").trim();
  for (const [patron, por] of INTERNO) t = t.replace(patron, por);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
