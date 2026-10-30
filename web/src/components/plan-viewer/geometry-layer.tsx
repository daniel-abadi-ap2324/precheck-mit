import type { Highlight, PlanLayerVisibility } from "./types";
import { boundsOf, centroid, padBounds, toPath } from "./geometry";
import { DimensionLine } from "./dimension-line";
import { LabelChip } from "./label-chip";

interface GeometryLayerProps {
  highlights: Highlight[];
  layers: PlanLayerVisibility;
  scale: number;
}

const DIM = "var(--mp-dimension)";

function Shape({ h, scale, showLabel }: { h: Highlight; scale: number; showLabel: boolean }) {
  const u = (px: number) => px / scale;
  const [cx, cy] = centroid(h.points);
  switch (h.kind) {
    case "boundary":
      return <path d={toPath(h.points)} fill="none" stroke={DIM} strokeWidth={u(2.5)} strokeDasharray="1 0.4" data-kind="boundary" />;
    case "building":
      return <path d={toPath(h.points)} fill={DIM} fillOpacity={0.1} stroke={DIM} strokeWidth={u(2)} data-kind="building" />;
    case "area":
      return (
        <g data-kind="area">
          <path d={toPath(h.points)} fill="url(#pv-hatch-dim)" fillOpacity={0.55} stroke={DIM} strokeWidth={u(1.6)} />
          {h.label && showLabel ? <LabelChip x={cx} y={(boundsOf(h.points)?.minY ?? cy) + u(18)} text={h.label} scale={scale} /> : null}
        </g>
      );
    case "measurement":
      return h.points.length >= 2 ? <DimensionLine a={h.points[0]} b={h.points[1]} label={h.label} scale={scale} emphasis showLabel={showLabel} /> : null;
    case "point":
      return (
        <g data-kind="point">
          <circle cx={cx} cy={cy} r={u(14)} fill={DIM} fillOpacity={0.12} stroke={DIM} strokeWidth={u(1)} />
          <circle cx={cx} cy={cy} r={u(4.5)} fill={DIM} stroke="var(--mp-sheet)" strokeWidth={u(1.5)} />
          {h.label && showLabel ? <LabelChip x={cx + u(20)} y={cy} text={h.label} scale={scale} anchor="start" /> : null}
        </g>
      );
  }
}

function isVisible(h: Highlight, layers: PlanLayerVisibility): boolean {
  if (h.kind === "boundary") return layers.boundary;
  if (h.kind === "building") return layers.building;
  if (h.kind === "measurement") return layers.measurements;
  return true;
}

/** Recuadro de selección con agarraderas, alrededor de toda la geometría resaltada. */
function SelectionBox({ highlights, scale }: { highlights: Highlight[]; scale: number }) {
  const u = (px: number) => px / scale;
  const b = boundsOf(highlights.flatMap((h) => h.points));
  if (!b) return null;
  const degenerate = b.maxX - b.minX < 0.01 && b.maxY - b.minY < 0.01;
  const p = padBounds(b, u(degenerate ? 24 : 10));
  const g = u(6);
  const corners: [number, number][] = [[p.minX, p.minY], [p.maxX, p.minY], [p.maxX, p.maxY], [p.minX, p.maxY]];
  return (
    <g data-kind="bbox" aria-hidden>
      <rect x={p.minX} y={p.minY} width={p.maxX - p.minX} height={p.maxY - p.minY} fill="none" stroke={DIM} strokeWidth={u(1)} strokeDasharray={`${u(5)} ${u(4)}`} />
      {corners.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - g / 2} y={y - g / 2} width={g} height={g} fill="var(--mp-sheet)" stroke={DIM} strokeWidth={u(1.2)} />
      ))}
    </g>
  );
}

/** Geometría de la regla seleccionada: lindero, huella, áreas, cotas y puntos. */
export function GeometryLayer({ highlights, layers, scale }: GeometryLayerProps) {
  const visible = highlights.filter((h) => isVisible(h, layers));
  if (visible.length === 0) return null;
  return (
    <g data-layer="highlight">
      <SelectionBox highlights={visible} scale={scale} />
      {visible.map((h, i) => (
        <Shape key={`${h.kind}-${i}`} h={h} scale={scale} showLabel={layers.annotations} />
      ))}
    </g>
  );
}
