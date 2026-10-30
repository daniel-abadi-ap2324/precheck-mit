"use client";

import { useState } from "react";
import type { LngLat } from "@/types";
import { distance, formatMetres } from "./geometry";

/** Estado de la herramienta Medir: dos clics definen una cota; un tercero empieza otra. */
export function useMeasure() {
  const [points, setPoints] = useState<LngLat[]>([]);
  const [hover, setHover] = useState<LngLat | null>(null);
  const addPoint = (p: LngLat) => setPoints((cur) => (cur.length >= 2 ? [p] : [...cur, p]));
  const clear = () => {
    setPoints([]);
    setHover(null);
  };
  const result = points.length === 2 ? formatMetres(distance(points[0], points[1])) : null;
  return { points, hover: points.length === 1 ? hover : null, addPoint, setHover, clear, result };
}
