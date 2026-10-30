/**
 * Datos que piden las reglas del motor (reglas/*.json) y que una persona puede corregir o agregar cuando el lector
 * no los encontró o se equivocó. La clave es la ruta del hecho en el motor.
 */
export interface DatoEditable {
  clave: string;
  etiqueta: string;
  unidad?: string;
}

export const DATOS_EDITABLES: DatoEditable[] = [
  { clave: "lote.area_m2", etiqueta: "Área del lote", unidad: "m²" },
  { clave: "lote.frente_m", etiqueta: "Frente del lote", unidad: "m" },
  { clave: "lote.fondo_m", etiqueta: "Fondo del lote", unidad: "m" },
  { clave: "lote.linea_construccion_m", etiqueta: "Línea de construcción", unidad: "m" },
  { clave: "proyecto.pisos_totales", etiqueta: "Pisos" },
  { clave: "proyecto.altura_m", etiqueta: "Altura de la edificación", unidad: "m" },
  { clave: "proyecto.unidades_vivienda", etiqueta: "Unidades de vivienda" },
  { clave: "proyecto.densidad_pers_ha", etiqueta: "Densidad", unidad: "pers/ha" },
  { clave: "proyecto.ocupacion_pct", etiqueta: "Ocupación", unidad: "%" },
  { clave: "proyecto.area_libre_pct", etiqueta: "Área libre", unidad: "%" },
  { clave: "proyecto.area_verde_pct", etiqueta: "Área verde", unidad: "%" },
  { clave: "proyecto.estacionamientos", etiqueta: "Estacionamientos" },
  { clave: "proyecto.estacionamientos_visita", etiqueta: "Estacionamientos de visita" },
  { clave: "proyecto.acera_ancho_m", etiqueta: "Ancho de acera", unidad: "m" },
  { clave: "proyecto.retiro_frontal_m", etiqueta: "Retiro frontal", unidad: "m" },
  { clave: "proyecto.retiro_lateral_m", etiqueta: "Retiro lateral", unidad: "m" },
  { clave: "proyecto.retiro_posterior_m", etiqueta: "Retiro posterior", unidad: "m" },
  { clave: "proyecto.retiro_min_m", etiqueta: "Retiro mínimo", unidad: "m" },
  { clave: "lote.finca", etiqueta: "Finca" },
  { clave: "lote.corregimiento", etiqueta: "Corregimiento" },
  { clave: "plano.zonificacion_declarada", etiqueta: "Zonificación declarada" },
];

/** Datos que son texto (el resto se guarda como número). */
const TEXTO = new Set(["lote.finca", "lote.fincas", "lote.corregimiento", "plano.zonificacion_declarada"]);
export const esTexto = (clave: string) => TEXTO.has(clave);

/** «1 250,5», «1250.5» o «1,250.5» → 1250.5; null si no es un número. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  const coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
  // El último separador es el decimal; el otro, de miles.
  const limpio = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** El valor que se envía al servidor para lo que escribió la persona, o el mensaje de error. */
export function valorEscrito(clave: string, texto: string): { valor: string | number } | { error: string } {
  const t = texto.trim();
  if (!t) return { error: "Escriba un valor." };
  if (esTexto(clave)) return t.length > 200 ? { error: "Es demasiado largo." } : { valor: t };
  const n = leerNumero(t);
  return n === null ? { error: "Escriba un número, por ejemplo 1250,5." } : { valor: n };
}
