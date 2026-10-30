import type { LngLat } from "@/types";
import { DimensionLine } from "./dimension-line";
import { distance, formatMetres } from "./geometry";

interface MeasureLayerProps {
  points: LngLat[];
  hover: LngLat | null;
  scale: number;
}

/** Medición del usuario: primer punto + vista previa, luego cota con la distancia en metros. */
export function MeasureLayer({ points, hover, scale }: MeasureLayerProps) {
  const u = (px: number) => px / scale;
  if (points.length === 0) return null;
  const [a] = points;
  const b = points[1] ?? hover;
  return (
    <g data-layer="measure">
      <circle cx={a[0]} cy={a[1]} r={u(3.5)} fill="var(--mp-dimension)" />
      {b ? <DimensionLine a={a} b={b} label={formatMetres(distance(a, b))} scale={scale} emphasis /> : null}
      {points[1] ? <circle cx={points[1][0]} cy={points[1][1]} r={u(3.5)} fill="var(--mp-dimension)" /> : null}
    </g>
  );
}
