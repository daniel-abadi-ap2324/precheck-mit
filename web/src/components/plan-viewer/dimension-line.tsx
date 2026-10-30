import type { LngLat } from "@/types";
import { midpoint, normal } from "./geometry";
import { LabelChip } from "./label-chip";

interface DimensionLineProps {
  a: LngLat;
  b: LngLat;
  label?: string;
  scale: number;
  /** Desplazamiento de la línea de cota respecto a los puntos medidos, en metros. */
  offset?: number;
  /** Cota resaltada: trazo más grueso, flechas y rótulo en chip. */
  emphasis?: boolean;
  showLabel?: boolean;
}

/** Cota estilo CAD: líneas de extensión, línea de cota, remates y rótulo. */
export function DimensionLine({ a, b, label, scale, offset = 0, emphasis = false, showLabel = true }: DimensionLineProps) {
  const u = (px: number) => px / scale;
  const [nx, ny] = normal(a, b);
  const pa: LngLat = [a[0] + nx * offset, a[1] + ny * offset];
  const pb: LngLat = [b[0] + nx * offset, b[1] + ny * offset];
  const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
  const [dx, dy] = [(pb[0] - pa[0]) / len, (pb[1] - pa[1]) / len];
  const ext = u(6);
  const extLine = (p: LngLat, q: LngLat) => `M${p[0] - nx * (offset ? 0 : ext)} ${p[1] - ny * (offset ? 0 : ext)} L${q[0] + nx * ext} ${q[1] + ny * ext}`;
  const arrow = (p: LngLat, dir: 1 | -1) => {
    const l = u(9), w = u(3.2);
    const [bx, by] = [p[0] + dx * l * dir, p[1] + dy * l * dir];
    return `M${p[0]} ${p[1]} L${bx + nx * w} ${by + ny * w} L${bx - nx * w} ${by - ny * w} Z`;
  };
  const tick = (p: LngLat) => {
    const t = u(4);
    return `M${p[0] - (dx + nx) * t} ${p[1] - (dy + ny) * t} L${p[0] + (dx + nx) * t} ${p[1] + (dy + ny) * t}`;
  };
  const [mx, my] = midpoint(pa, pb);
  const labelOffset = u(emphasis ? 16 : 9);
  const color = "var(--mp-dimension)";
  return (
    <g stroke={color} fill="none" opacity={emphasis ? 1 : 0.75} data-kind="dimension">
      <path d={`${extLine(a, pa)} ${extLine(b, pb)}`} strokeWidth={u(0.8)} />
      <path d={`M${pa[0]} ${pa[1]} L${pb[0]} ${pb[1]}`} strokeWidth={u(emphasis ? 2 : 0.9)} />
      {emphasis ? <path d={`${arrow(pa, 1)} ${arrow(pb, -1)}`} fill={color} stroke="none" /> : <path d={`${tick(pa)} ${tick(pb)}`} strokeWidth={u(1.4)} />}
      {label && showLabel ? (
        emphasis ? (
          <LabelChip x={mx + nx * labelOffset} y={my + ny * labelOffset} text={label} scale={scale} anchor={Math.abs(nx) > 0.5 ? (nx < 0 ? "end" : "start") : "middle"} />
        ) : (
          <text x={mx + nx * labelOffset} y={my + ny * labelOffset} fontSize={0.5} fill={color} stroke="none" textAnchor="middle" dominantBaseline="central" className="tabular">
            {label}
          </text>
        )
      ) : null}
    </g>
  );
}
