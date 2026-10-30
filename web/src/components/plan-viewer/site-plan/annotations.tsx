import type { PlanLayerVisibility } from "../types";
import { DimensionLine } from "../dimension-line";

interface Props {
  scale: number;
  layers: PlanLayerVisibility;
}

const INK = "var(--mp-ink)";
const MUTED = "var(--mp-ink-muted)";

function NorthArrow({ u }: { u: (n: number) => number }) {
  return (
    <g transform="translate(4 4.2)" aria-hidden>
      <circle r={1.5} fill="none" stroke={INK} strokeWidth={u(1)} />
      <path d="M0 -1.3 L0.55 1 L0 0.55 Z" fill={INK} />
      <path d="M0 -1.3 L-0.55 1 L0 0.55 Z" fill="none" stroke={INK} strokeWidth={u(0.8)} />
      <text y={-1.85} fontSize={0.7} fontWeight={700} fill={INK} textAnchor="middle">N</text>
    </g>
  );
}

function ScaleBar({ u }: { u: (n: number) => number }) {
  return (
    <g transform="translate(1.6 7.6)" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={i} y={0} width={1} height={0.3} fill={i % 2 ? "var(--mp-plan-paper)" : INK} stroke={INK} strokeWidth={u(0.6)} />
      ))}
      <text x={0} y={0.95} fontSize={0.42} fill={INK} textAnchor="middle">0</text>
      <text x={5} y={0.95} fontSize={0.42} fill={INK} textAnchor="middle">5 m</text>
    </g>
  );
}

function TitleBlock({ u }: { u: (n: number) => number }) {
  const rows = ["Residencia Betania 01", "Lote de demostración 1, Betania · Finca 083076", "Zona RM-2 · Escala 1:200", "Fecha 26-09-2026 · Rev. 0"];
  return (
    <g transform="translate(33 0.6)">
      <rect width={6.4} height={9.4} fill="var(--mp-sheet)" stroke={INK} strokeWidth={u(1.2)} />
      <path d="M0 5.6 H6.4 M0 6.55 H6.4 M0 7.5 H6.4 M0 8.45 H6.4" stroke={INK} strokeWidth={u(0.6)} />
      <text x={0.4} y={1.3} fontSize={0.45} fill={MUTED}>Lámina</text>
      <text x={0.4} y={3.1} fontSize={1.5} fontWeight={700} fill={INK}>A-101</text>
      <text x={0.4} y={4.5} fontSize={0.55} fontWeight={600} fill={INK}>Planta de conjunto</text>
      {rows.map((r, i) => (
        <text key={r} x={0.3} y={6.2 + i * 0.95} fontSize={0.38} fill={INK}>{r}</text>
      ))}
    </g>
  );
}

/** Norte, escala gráfica, rótulo de lámina y cotas generales. */
export function SheetAnnotations({ scale, layers }: Props) {
  const u = (px: number) => px / scale;
  return (
    <g>
      <rect x={0.6} y={0.6} width={38.8} height={52.8} fill="none" stroke={INK} strokeWidth={u(1.4)} />
      <NorthArrow u={u} />
      <ScaleBar u={u} />
      <TitleBlock u={u} />
      {layers.measurements ? (
        <g>
          <DimensionLine a={[32, 6]} b={[8, 6]} offset={1.6} label="24.00" scale={scale} />
          <DimensionLine a={[8, 6]} b={[8, 46]} offset={1.8} label="40.00" scale={scale} />
          <DimensionLine a={[11.5, 14]} b={[11.5, 41.75]} offset={1.6} label="27.75" scale={scale} />
          <DimensionLine a={[28.8, 14]} b={[11.5, 14]} offset={0.9} label="17.30" scale={scale} />
        </g>
      ) : null}
    </g>
  );
}
