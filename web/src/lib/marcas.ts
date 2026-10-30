import type { MarcaPlano } from "@/types";

/**
 * Marcas sobre la lámina: rectángulos en fracciones 0–1 de la página completa (x, y desde la esquina superior
 * izquierda), así no dependen de la resolución de la miniatura. Vienen de dos fuentes: el dictamen de la IA
 * (evidencia[].marcas) y el lector de planos (bbox en puntos del PDF de un dato leído).
 */
const MAX_MARCAS = 8;
const PT_POR_MM = 72 / 25.4;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Valida un rectángulo en fracciones; recorta lo que se sale de la página y descarta lo inválido o diminuto. */
export function marcaValida(crudo: unknown): Omit<MarcaPlano, "pagina" | "origen"> | null {
  const m = (crudo ?? {}) as Record<string, unknown>;
  const x = num(m.x), y = num(m.y), w = num(m.w), h = num(m.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (x < -0.02 || y < -0.02 || x > 1 || y > 1 || w <= 0 || h <= 0) return null;
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const w1 = Math.min(w, 1 - x0), h1 = Math.min(h, 1 - y0);
  if (w1 < 0.002 || h1 < 0.002) return null;
  const etiqueta = typeof m.etiqueta === "string" && m.etiqueta.trim() ? m.etiqueta.trim().slice(0, 120) : undefined;
  return { x: x0, y: y0, w: w1, h: h1, ...(etiqueta ? { etiqueta } : {}) };
}

/** Marcas de la evidencia del dictamen (cada evidencia cita su página). Lo inválido se ignora sin romper el dictamen. */
export function marcasDeEvidencia(evidencia: { pagina?: number | null; detalle?: string | null; marcas?: unknown }[] | null | undefined): MarcaPlano[] {
  const salida: MarcaPlano[] = [];
  for (const e of evidencia ?? []) {
    if (typeof e.pagina !== "number" || !Array.isArray(e.marcas)) continue;
    for (const crudo of e.marcas) {
      const m = marcaValida(crudo);
      if (m) salida.push({ ...m, pagina: e.pagina, origen: "ia", etiqueta: m.etiqueta ?? e.detalle?.trim() ?? undefined });
    }
  }
  return salida.slice(0, MAX_MARCAS);
}

/** bbox del lector (puntos del PDF: x0, y0, x1, y1) → rectángulo en fracciones de la página. */
export function marcaDeBbox(bbox: unknown, pagina: number, dims: { ancho_mm: number; alto_mm: number } | undefined, etiqueta?: string): MarcaPlano | null {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !dims) return null;
  const [x0, y0, x1, y1] = bbox.map(num);
  if (x0 === null || y0 === null || x1 === null || y1 === null) return null;
  if (x1 <= x0 || y1 <= y0) return null;
  const ancho = dims.ancho_mm * PT_POR_MM, alto = dims.alto_mm * PT_POR_MM;
  if (!(ancho > 0) || !(alto > 0)) return null;
  // Margen para que el rectángulo no quede pegado al texto.
  const px = 4 / ancho, py = 4 / alto;
  const m = marcaValida({ x: x0 / ancho - px, y: y0 / alto - py, w: (x1 - x0) / ancho + 2 * px, h: (y1 - y0) / alto + 2 * py, etiqueta });
  return m ? { ...m, pagina, origen: "lector" } : null;
}

/** Marcas de una página (las que el visor dibuja). */
export const marcasDePagina = (marcas: MarcaPlano[] | undefined, pagina: number | null): MarcaPlano[] => (pagina === null ? [] : (marcas ?? []).filter((m) => m.pagina === pagina));
