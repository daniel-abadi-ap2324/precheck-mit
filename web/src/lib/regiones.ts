import type { OrigenRegion, PaginaRegiones, RegionPlano, RegionesPlano, TipoRegion } from "@/types";
import { coloresRegion } from "@/config/region-colors";

/**
 * Regiones del plano (paso 2 del flujo de 3 pasos): polígonos en fracciones 0–1 de la página, propuestos por el
 * sistema (vectorial o visión) y editables por la persona. Son evidencia para la revisión, nunca medida exacta.
 * Módulo compartido por el servidor (validación al guardar) y el editor (colores, geometría y exportación).
 */

/** Tipos, colores y etiquetas del contrato. Los colores son fijos por tipo (excepción a los tokens de la interfaz). */
export const TIPOS_REGION: readonly { tipo: TipoRegion; color: string; etiqueta: string }[] = [
  { tipo: "lote", color: coloresRegion.lote, etiqueta: "Lote" },
  { tipo: "huella", color: coloresRegion.huella, etiqueta: "Huella de la edificación" },
  { tipo: "retiro_frontal", color: coloresRegion.retiro_frontal, etiqueta: "Retiro frontal" },
  { tipo: "retiro_lateral", color: coloresRegion.retiro_lateral, etiqueta: "Retiro lateral" },
  { tipo: "retiro_posterior", color: coloresRegion.retiro_posterior, etiqueta: "Retiro posterior" },
  { tipo: "estacionamiento", color: coloresRegion.estacionamiento, etiqueta: "Estacionamiento" },
  { tipo: "acera", color: coloresRegion.acera, etiqueta: "Acera" },
  { tipo: "area_verde", color: coloresRegion.area_verde, etiqueta: "Área verde" },
  { tipo: "tinaquera", color: coloresRegion.tinaquera, etiqueta: "Tinaquera" },
  { tipo: "acceso_vehicular", color: coloresRegion.acceso_vehicular, etiqueta: "Acceso vehicular" },
  { tipo: "escalera_rampa", color: coloresRegion.escalera_rampa, etiqueta: "Escalera o rampa" },
  { tipo: "otro", color: coloresRegion.otro, etiqueta: "Otro" },
];

const POR_TIPO = new Map(TIPOS_REGION.map((t) => [t.tipo, t]));
export const esTipoRegion = (v: unknown): v is TipoRegion => typeof v === "string" && POR_TIPO.has(v as TipoRegion);
export const colorDeTipo = (tipo: TipoRegion): string => POR_TIPO.get(tipo)?.color ?? coloresRegion.otro;
export const etiquetaDeTipo = (tipo: TipoRegion): string => POR_TIPO.get(tipo)?.etiqueta ?? tipo;

export const ORIGENES: readonly OrigenRegion[] = ["vectorial", "vision", "humano"];
export const etiquetaDeOrigen: Record<OrigenRegion, string> = {
  vectorial: "polígono del PDF",
  vision: "modelo de visión",
  humano: "dibujada o editada a mano",
};

/** Texto del botón de propuesta con visión, con el modelo que la hará si se conoce. */
export const etiquetaVision = (modelo?: string) => (modelo ? `Proponer con IA (visión · ${modelo})` : "Proponer con IA (visión)");

/**
 * La revisó una persona: la confirmó, la corrigió o la dibujó. La propuesta automática nunca la reemplaza, y el paso de
 * ejecutar la usa para saber si la IA tendrá polígonos revisados o solo los propuestos.
 */
export const revisadaPorPersona = (r: Pick<RegionPlano, "confirmada" | "editada" | "origen">) => r.confirmada || r.editada || r.origen === "humano";

/** Umbral del motor: ninguna región llega a él (una región sola nunca decide una regla). */
export const UMBRAL_MOTOR = 0.85;
export const CONFIANZA_MAXIMA = 0.8;

/** Confianza según el contrato: confirmada 0.80; editada u origen humano 0.70; vectorial 0.70; visión 0.50. */
export function confianzaDe(r: Pick<RegionPlano, "confirmada" | "editada" | "origen">): number {
  if (r.confirmada) return 0.8;
  if (r.editada || r.origen === "humano") return 0.7;
  return r.origen === "vectorial" ? 0.7 : 0.5;
}

// ---------------------------------------------------------------------------------------------------------------
// Validación estricta (la usa el servidor al leer y al guardar)
// ---------------------------------------------------------------------------------------------------------------

export const MAX_REGIONES = 500;
export const MAX_VERTICES = 200;
export const MAX_ETIQUETA = 120;
const ID_REGION = /^[A-Za-z0-9_-]{1,64}$/;
const CLAVE_PAGINA = /^[1-9]\d{0,2}$/;
const IMAGEN = /^r[1-9]\d{0,2}\.png$/;

export class ErrorRegiones extends Error {}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numeroFinito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Puntos de un polígono: ≥ 3 vértices [x, y] en fracciones 0–1 y a lo sumo MAX_VERTICES. Lanza si no sirven. */
export function validarPuntos(v: unknown, donde: string): [number, number][] {
  if (!Array.isArray(v) || v.length < 3) throw new ErrorRegiones(`${donde}: el polígono necesita al menos 3 vértices.`);
  if (v.length > MAX_VERTICES) throw new ErrorRegiones(`${donde}: el polígono tiene más de ${MAX_VERTICES} vértices.`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !numeroFinito(p[0]) || !numeroFinito(p[1])) throw new ErrorRegiones(`${donde}: el vértice ${i + 1} no es un par [x, y].`);
    if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) throw new ErrorRegiones(`${donde}: el vértice ${i + 1} está fuera de la página (fracciones entre 0 y 1).`);
    return [p[0], p[1]] as [number, number];
  });
}

/** Una región completa (como la escribe Python o la guarda el servidor). */
export function validarRegion(v: unknown, paginas: Record<string, PaginaRegiones>, i: number): RegionPlano {
  const donde = `Región ${i + 1}`;
  if (!esObjeto(v)) throw new ErrorRegiones(`${donde}: no es un objeto.`);
  if (typeof v.id !== "string" || !ID_REGION.test(v.id)) throw new ErrorRegiones(`${donde}: identificador no válido.`);
  if (!Number.isInteger(v.pagina) || !paginas[String(v.pagina)]) throw new ErrorRegiones(`${donde}: la página ${String(v.pagina)} no existe en el plano.`);
  if (!esTipoRegion(v.tipo)) throw new ErrorRegiones(`${donde}: el tipo «${String(v.tipo).slice(0, 40)}» no está permitido.`);
  if (!ORIGENES.includes(v.origen as OrigenRegion)) throw new ErrorRegiones(`${donde}: origen no válido.`);
  if (!numeroFinito(v.confianza) || v.confianza < 0 || v.confianza > 1) throw new ErrorRegiones(`${donde}: confianza fuera de 0–1.`);
  if (typeof v.confirmada !== "boolean" || typeof v.editada !== "boolean") throw new ErrorRegiones(`${donde}: «confirmada» y «editada» deben ser sí/no.`);
  const etiqueta = v.etiqueta ?? "";
  if (typeof etiqueta !== "string" || etiqueta.length > MAX_ETIQUETA) throw new ErrorRegiones(`${donde}: la etiqueta debe ser un texto de hasta ${MAX_ETIQUETA} caracteres.`);
  return {
    id: v.id,
    pagina: v.pagina as number,
    tipo: v.tipo,
    puntos: validarPuntos(v.puntos, donde),
    origen: v.origen as OrigenRegion,
    // Nunca a la altura del umbral del motor, aunque el archivo diga otra cosa.
    confianza: Math.min(v.confianza, CONFIANZA_MAXIMA),
    etiqueta,
    confirmada: v.confirmada,
    editada: v.editada,
  };
}

function validarPagina(v: unknown, clave: string): PaginaRegiones {
  const donde = `Página ${clave}`;
  if (!esObjeto(v)) throw new ErrorRegiones(`${donde}: no es un objeto.`);
  if (typeof v.imagen !== "string" || !IMAGEN.test(v.imagen)) throw new ErrorRegiones(`${donde}: nombre de imagen no válido.`);
  if (!numeroFinito(v.ancho_px) || !numeroFinito(v.alto_px) || v.ancho_px <= 0 || v.alto_px <= 0) throw new ErrorRegiones(`${donde}: tamaño de imagen no válido.`);
  const opcional = (x: unknown) => (numeroFinito(x) && x > 0 ? x : null);
  return { imagen: v.imagen, ancho_px: v.ancho_px, alto_px: v.alto_px, ancho_mm: opcional(v.ancho_mm), alto_mm: opcional(v.alto_mm), escala: opcional(v.escala) };
}

/** Lista de regiones: tope, ids únicos y cada región válida. */
export function validarListaRegiones(v: unknown, paginas: Record<string, PaginaRegiones>): RegionPlano[] {
  if (!Array.isArray(v)) throw new ErrorRegiones("«regiones» debe ser una lista.");
  if (v.length > MAX_REGIONES) throw new ErrorRegiones(`Hay más de ${MAX_REGIONES} regiones.`);
  const regiones = v.map((r, i) => validarRegion(r, paginas, i));
  const ids = new Set<string>();
  for (const r of regiones) {
    if (ids.has(r.id)) throw new ErrorRegiones(`El identificador de región «${r.id}» está repetido.`);
    ids.add(r.id);
  }
  return regiones;
}

/** regiones.json completo. Lanza ErrorRegiones con un mensaje legible si no cumple el contrato. */
export function validarRegionesPlano(v: unknown): RegionesPlano {
  if (!esObjeto(v)) throw new ErrorRegiones("regiones.json no es un objeto.");
  if (v.version !== 1) throw new ErrorRegiones("Versión de regiones.json no admitida.");
  if (!esObjeto(v.paginas)) throw new ErrorRegiones("«paginas» debe ser un objeto.");
  const paginas: Record<string, PaginaRegiones> = {};
  for (const [clave, p] of Object.entries(v.paginas)) {
    if (!CLAVE_PAGINA.test(clave)) throw new ErrorRegiones(`Página «${clave.slice(0, 10)}» no válida.`);
    paginas[clave] = validarPagina(p, clave);
  }
  return { version: 1, generado: typeof v.generado === "string" ? v.generado.slice(0, 40) : "", paginas, regiones: validarListaRegiones(v.regiones, paginas) };
}

// ---------------------------------------------------------------------------------------------------------------
// Geometría (fracciones 0–1 de la página)
// ---------------------------------------------------------------------------------------------------------------

export type Punto = [number, number];

const recortar01 = (v: number) => Math.min(1, Math.max(0, v));

/** Punto de pantalla en píxeles de la imagen → fracción de la página, recortado a 0–1. */
export const aFraccion = (px: number, py: number, ancho: number, alto: number): Punto => [recortar01(px / ancho), recortar01(py / alto)];

/** Inserta un vértice después del índice `i` (en el lado i → i+1). */
export function agregarVertice(puntos: Punto[], i: number, p: Punto): Punto[] {
  if (puntos.length >= MAX_VERTICES) return puntos;
  return [...puntos.slice(0, i + 1), [recortar01(p[0]), recortar01(p[1])], ...puntos.slice(i + 1)];
}

/** Quita el vértice `i`; un polígono nunca queda con menos de 3 (en ese caso no cambia). */
export function quitarVertice(puntos: Punto[], i: number): Punto[] {
  if (puntos.length <= 3 || i < 0 || i >= puntos.length) return puntos;
  return puntos.filter((_, j) => j !== i);
}

/** Mueve el vértice `i` a `p` (recortado a la página). */
export const moverVertice = (puntos: Punto[], i: number, p: Punto): Punto[] => puntos.map((q, j) => (j === i ? [recortar01(p[0]), recortar01(p[1])] : q));

/** Proyección de p sobre el segmento a–b y su distancia (en las unidades que se pasen). */
export function proyectarEnSegmento(p: Punto, a: Punto, b: Punto): { punto: Punto; distancia: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2));
  const punto: Punto = [a[0] + t * dx, a[1] + t * dy];
  return { punto, distancia: Math.hypot(p[0] - punto[0], p[1] - punto[1]) };
}

/** Lado del polígono más cercano a p: índice del vértice donde empieza y el punto proyectado. */
export function ladoMasCercano(puntos: Punto[], p: Punto): { indice: number; punto: Punto; distancia: number } {
  let mejor = { indice: 0, punto: puntos[0], distancia: Infinity };
  puntos.forEach((a, i) => {
    const r = proyectarEnSegmento(p, a, puntos[(i + 1) % puntos.length]);
    if (r.distancia < mejor.distancia) mejor = { indice: i, ...r };
  });
  return mejor;
}

/** Punto dentro del polígono (regla par-impar). */
export function puntoEnPoligono(p: Punto, puntos: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const [xi, yi] = puntos[i], [xj, yj] = puntos[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Centro (promedio de vértices) para ubicar un rótulo. */
export const centroDe = (puntos: Punto[]): Punto => [puntos.reduce((s, p) => s + p[0], 0) / puntos.length, puntos.reduce((s, p) => s + p[1], 0) / puntos.length];

/** Conteo por tipo, en el orden de la tabla (solo los tipos presentes). */
export function conteoPorTipo(regiones: Pick<RegionPlano, "tipo">[]): { tipo: TipoRegion; color: string; etiqueta: string; conteo: number }[] {
  const cuenta = new Map<TipoRegion, number>();
  for (const r of regiones) cuenta.set(r.tipo, (cuenta.get(r.tipo) ?? 0) + 1);
  return TIPOS_REGION.filter((t) => cuenta.has(t.tipo)).map((t) => ({ ...t, conteo: cuenta.get(t.tipo) ?? 0 }));
}

/** Id nuevo para una región dibujada a mano (mismo formato que las de Python: «r-» y hexadecimal). */
export function nuevoIdRegion(existentes: Iterable<string>): string {
  const usados = new Set(existentes);
  for (;;) {
    const id = `r-${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0")}`;
    if (!usados.has(id)) return id;
  }
}

export const AVISO_REGIONES = "Las regiones ayudan a revisar; no se toman como medida exacta.";
