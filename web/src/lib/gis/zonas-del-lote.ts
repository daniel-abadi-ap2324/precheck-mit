import type { ZonePolygon } from "@/types";
import { featureCollectionBBox, pointInPolygon } from "./geo";
import { centroide, type Punto } from "./lote-dibujado";

export interface ZonaDelLote {
  hoja: string;
  poligono: string;
  zona: ZonePolygon;
  /** Porcentaje del área del lote que cae en este polígono (0–100, un decimal; para mostrar). */
  pct: number;
  /** Fracción sin redondear (0–1): es la que se compara con el umbral del 99 %. */
  fraccion: number;
}

/** Muestras mínimas dentro del lote para decidir una zona; con menos, el lote va a revisión. */
export const MUESTRAS_MINIMAS = 2000;

const poligono = (puntos: Punto[]): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [[...puntos, puntos[0]]] });

/**
 * Puntos de una grilla regular dentro del lote (≈ `lado`² celdas sobre su caja). Cada muestra representa la misma
 * área, así que la fracción de muestras en una zona estima la fracción del área del lote en esa zona.
 */
export function muestrasDelLote(puntos: Punto[], lado?: number): Punto[] {
  if (lado === undefined) {
    // La grilla cubre la caja del lote: un lote delgado o girado deja la mayoría fuera. Se refina hasta tener
    // al menos MUESTRAS_MINIMAS dentro (o hasta 480 × 480).
    let m: Punto[] = [];
    for (let n = 60; n <= 480; n *= 2) {
      m = muestrasDelLote(puntos, n);
      if (m.length >= MUESTRAS_MINIMAS) break;
    }
    return m;
  }
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const g = poligono(puntos);
  const out: Punto[] = [];
  for (let i = 0; i < lado; i++) {
    for (let j = 0; j < lado; j++) {
      const p: Punto = [x0 + ((i + 0.5) / lado) * (x1 - x0), y0 + ((j + 0.5) / lado) * (y1 - y0)];
      if (pointInPolygon(p, g)) out.push(p);
    }
  }
  return out;
}

/** Un punto dentro del lote: el centroide si cae dentro; si no (lote cóncavo), la muestra más cercana a él. */
export function puntoInterior(puntos: Punto[]): Punto {
  const c = centroide(puntos);
  if (pointInPolygon(c, poligono(puntos))) return c;
  const m = muestrasDelLote(puntos, 40);
  return m.reduce((best, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(best[0] - c[0], best[1] - c[1]) ? p : best), m[0] ?? c);
}

/**
 * Polígonos del Documento Gráfico que toca el lote, con el % de su área en cada uno (de mayor a menor), y el %
 * que no cae en ninguna zona de las hojas dadas. Así un lote partido entre zonas no recibe en silencio la zona
 * de su centroide (skill GIS: por debajo del 99 % no se elige).
 */
export function zonasDelLote(puntos: Punto[], hojas: GeoJSON.FeatureCollection[]): { zonas: ZonaDelLote[]; sinZonaPct: number; muestras: number } {
  const muestras = muestrasDelLote(puntos);
  const lote = featureCollectionBBox({ type: "FeatureCollection", features: [{ type: "Feature", geometry: poligono(puntos), properties: {} }] });
  const candidatas = hojas.flatMap((h) =>
    h.features.filter((f) => {
      const b = featureCollectionBBox({ type: "FeatureCollection", features: [f] });
      return b && lote && !(b[2] < lote[0] || b[0] > lote[2] || b[3] < lote[1] || b[1] > lote[3]);
    }),
  );
  const cuenta = new Map<string, { f: GeoJSON.Feature; n: number }>();
  let sinZona = 0;
  for (const p of muestras) {
    const f = candidatas.find((c) => pointInPolygon(p, c.geometry));
    if (!f) {
      sinZona += 1;
      continue;
    }
    const id = String(f.properties?.id);
    cuenta.set(id, { f, n: (cuenta.get(id)?.n ?? 0) + 1 });
  }
  const total = muestras.length || 1;
  const pct = (n: number) => Math.round((1000 * n) / total) / 10;
  const zonas = [...cuenta.values()]
    .sort((a, b) => b.n - a.n)
    .map(({ f, n }) => {
      const zona = f.properties as ZonePolygon;
      return { hoja: zona.hoja, poligono: zona.id, zona, pct: pct(n), fraccion: n / total };
    });
  return { zonas, sinZonaPct: pct(sinZona), muestras: muestras.length };
}
