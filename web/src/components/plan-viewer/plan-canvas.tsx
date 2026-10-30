import type { LngLat } from "@/types";
import type { Highlight, PlanLayerVisibility, PlanSource } from "./types";
import { PlanDefs } from "./plan-defs";
import { GeometryLayer } from "./geometry-layer";
import { MeasureLayer } from "./measure-layer";

interface PlanCanvasProps {
  source: PlanSource;
  layers: PlanLayerVisibility;
  highlights: Highlight[];
  measure: { points: LngLat[]; hover: LngLat | null };
  transform: { scale: number; tx: number; ty: number };
  label: string;
}

/** Lienzo SVG: una sola matriz de transformación lleva metros del plano a píxeles. */
export function PlanCanvas({ source, layers, highlights, measure, transform: { scale, tx, ty }, label }: PlanCanvasProps) {
  return (
    <svg role="img" aria-label={label} className="absolute inset-0 size-full select-none" style={{ touchAction: "none" }}>
      <PlanDefs />
      <g transform={`matrix(${scale} 0 0 ${scale} ${tx} ${ty})`} fontFamily="inherit">
        <rect x={-0.15} y={-0.15} width={source.widthM + 0.3} height={source.heightM + 0.3} fill="var(--mp-line)" opacity={0.6} />
        {source.render({ layers, scale })}
        <GeometryLayer highlights={highlights} layers={layers} scale={scale} />
        <MeasureLayer points={measure.points} hover={measure.hover} scale={scale} />
      </g>
    </svg>
  );
}
