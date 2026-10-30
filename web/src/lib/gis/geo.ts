import type { Corregimiento, SheetCell, ZoningSheetEntry } from "@/types";

/** [lng, lat] en WGS84. */
export type LngLatTuple = [number, number];
/** [minLng, minLat, maxLng, maxLat]. */
export type BBox = [number, number, number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/**
 * Proyección equirectangular local alrededor de `origin`: x/y en metros. A la escala de un lote o de un
 * distrito (decenas de km) el error es menor de 0,1 %, suficiente para una marca de revisión. Las mediciones
 * con valor normativo se hacen en UTM 17N (EPSG:32617) en PostGIS.
 */
export function localProjector([lng0, lat0]: LngLatTuple): (p: GeoJSON.Position) => [number, number] {
  const kx = Math.cos(lat0 * RAD) * RAD * EARTH_RADIUS_M;
  const ky = RAD * EARTH_RADIUS_M;
  return (p) => [(p[0] - lng0) * kx, (p[1] - lat0) * ky];
}

/** Distancia plana de P al segmento AB (mismas unidades que las coordenadas). */
export function pointSegmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Distancia plana entre los segmentos AB y CD (0 si se cortan). */
export function segmentSegmentDistance(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): number {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Punto dentro de un anillo (ray casting; el borde cuenta de forma indistinta). */
function inRing(p: GeoJSON.Position, ring: GeoJSON.Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punto dentro de un Polygon/MultiPolygon GeoJSON (respeta los huecos). */
export function pointInPolygon(p: GeoJSON.Position, geometry: GeoJSON.Geometry | null | undefined): boolean {
  if (!geometry) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some(([outer, ...holes]) => Boolean(outer) && inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

/** Segmentos [a, b] (en coordenadas originales) de una geometría lineal o del borde de un polígono. */
function segmentsOf(g: GeoJSON.Geometry | null | undefined): GeoJSON.Position[][] {
  if (!g) return [];
  switch (g.type) {
    case "LineString":
      return [g.coordinates];
    case "MultiLineString":
    case "Polygon":
      return g.coordinates;
    case "MultiPolygon":
      return g.coordinates.flat();
    default:
      return [];
  }
}

export interface NearestLine {
  /** Distancia en metros (0 si el lote toca o cruza la línea). */
  distanceM: number;
  properties: GeoJSON.GeoJsonProperties;
}

/**
 * Distancia en metros de un lote (Polygon/MultiPolygon) o de un punto a la línea más cercana de la colección
 * (p. ej. los ríos). Devuelve null si la colección no tiene líneas.
 */
export function nearestLineDistance(target: GeoJSON.Geometry, lines: GeoJSON.FeatureCollection, origin?: LngLatTuple): NearestLine | null {
  const targetParts = target.type === "Point" ? [[target.coordinates]] : segmentsOf(target);
  const first = targetParts[0]?.[0];
  if (!first) return null;
  const project = localProjector(origin ?? [first[0], first[1]]);
  const tParts = targetParts.map((part) => part.map(project));
  const isArea = target.type === "Polygon" || target.type === "MultiPolygon";
  let best: NearestLine | null = null;
  for (const f of lines.features) {
    for (const line of segmentsOf(f.geometry)) {
      const l = line.map(project);
      let d = Infinity;
      if (isArea && line.some((p) => pointInPolygon(p, target))) d = 0;
      for (let i = 0; d > 0 && i < l.length; i++) {
        const a = l[i];
        const b = l[Math.min(i + 1, l.length - 1)];
        for (const part of tParts) {
          if (part.length === 1) d = Math.min(d, pointSegmentDistance(part[0], a, b));
          else for (let j = 0; j + 1 < part.length; j++) d = Math.min(d, segmentSegmentDistance(part[j], part[j + 1], a, b));
        }
      }
      if (!best || d < best.distanceM) best = { distanceM: d, properties: f.properties };
    }
  }
  return best;
}

/** Propiedades del primer polígono de la colección que contiene el punto, o null. */
export function featureAtPoint<T>(fc: GeoJSON.FeatureCollection, p: LngLatTuple): T | null {
  const f = fc.features.find((x) => pointInPolygon(p, x.geometry));
  return (f?.properties as T | undefined) ?? null;
}

/** Hoja del mosaico (índice DPU) que contiene el punto, o null si cae fuera del Documento Gráfico. */
export const sheetAtPoint = (mosaico: GeoJSON.FeatureCollection, p: LngLatTuple) => featureAtPoint<SheetCell>(mosaico, p);

/** Corregimiento (capa distrito8v4) que contiene el punto, o null si cae fuera del distrito. */
export const corregimientoAtPoint = (corregimientos: GeoJSON.FeatureCollection, p: LngLatTuple) => featureAtPoint<Corregimiento>(corregimientos, p);

export const bboxIntersects = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

export const ZONING_MIN_ZOOM = 13;
export const ZONING_MAX_SHEETS = 6;

/**
 * Hojas vectorizadas que conviene cargar para la vista: solo desde `minZoom`, las que cortan la vista y como
 * máximo `max`, priorizando las más cercanas al centro.
 */
export function sheetsForViewport(
  hojas: ZoningSheetEntry[],
  view: BBox,
  zoom: number,
  { minZoom = ZONING_MIN_ZOOM, max = ZONING_MAX_SHEETS }: { minZoom?: number; max?: number } = {},
): string[] {
  if (zoom < minZoom) return [];
  const cx = (view[0] + view[2]) / 2;
  const cy = (view[1] + view[3]) / 2;
  return hojas
    .filter((h): h is ZoningSheetEntry & { bbox: BBox } => Boolean(h.bbox) && bboxIntersects(h.bbox as BBox, view))
    .map((h) => ({ hoja: h.hoja, d: Math.hypot((h.bbox[0] + h.bbox[2]) / 2 - cx, (h.bbox[1] + h.bbox[3]) / 2 - cy) }))
    .sort((a, b) => a.d - b.d || a.hoja.localeCompare(b.hoja))
    .slice(0, max)
    .map((h) => h.hoja)
    .sort();
}

/** Caja envolvente de una colección (cualquier geometría), o null si está vacía. */
export function featureCollectionBBox(fc: GeoJSON.FeatureCollection): BBox | null {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c: GeoJSON.Position) => {
    b[0] = Math.min(b[0], c[0]);
    b[1] = Math.min(b[1], c[1]);
    b[2] = Math.max(b[2], c[0]);
    b[3] = Math.max(b[3], c[1]);
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || g.type === "GeometryCollection") continue;
    if (g.type === "Point") visit(g.coordinates);
    else segmentsOf(g).forEach((part) => part.forEach(visit));
    if (g.type === "MultiPoint") g.coordinates.forEach(visit);
  }
  return Number.isFinite(b[0]) ? b : null;
}
