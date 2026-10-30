import type { LngLat } from "@/types";
import type { Bounds } from "./types";

export function boundsOf(points: LngLat[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export const padBounds = (b: Bounds, pad: number): Bounds => ({ minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad });

export const distance = ([ax, ay]: LngLat, [bx, by]: LngLat): number => Math.hypot(bx - ax, by - ay);

export const midpoint = ([ax, ay]: LngLat, [bx, by]: LngLat): LngLat => [(ax + bx) / 2, (ay + by) / 2];

/** Centroide simple (promedio de vértices sin repetir el cierre). */
export function centroid(points: LngLat[]): LngLat {
  const pts = points.length > 1 && points[0][0] === points.at(-1)?.[0] && points[0][1] === points.at(-1)?.[1] ? points.slice(0, -1) : points;
  const [sx, sy] = pts.reduce<[number, number]>(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
  return [sx / pts.length, sy / pts.length];
}

/** Vector unitario perpendicular al segmento a→b. */
export function normal([ax, ay]: LngLat, [bx, by]: LngLat): LngLat {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  return [-(by - ay) / len, (bx - ax) / len];
}

export const toPath = (points: LngLat[]): string => points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

export const formatMetres = (m: number): string => `${m.toFixed(2)} m`;
