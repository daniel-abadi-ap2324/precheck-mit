import type { PlanLayerVisibility } from "../types";

interface Props {
  scale: number;
  layers: PlanLayerVisibility;
}

const INK = "var(--mp-ink)";
const MUTED = "var(--mp-ink-muted)";
const TREES_STREET: [number, number][] = [[12, 49.4], [19, 49.4], [35, 49.4]];
const TREES_GARDEN: [number, number][] = [[10.8, 8.8], [15.6, 8.2], [21.4, 9.3], [27.6, 8.5], [30.4, 10.6]];

function Tree({ x, y, r, u }: { x: number; y: number; r: number; u: (n: number) => number }) {
  return (
    <g stroke="var(--mp-pass)" strokeWidth={u(0.8)} fill="none" opacity={0.8}>
      <circle cx={x} cy={y} r={r} strokeDasharray={`${r * 0.5} ${r * 0.18}`} />
      <path d={`M${x - r * 0.35} ${y} H${x + r * 0.35} M${x} ${y - r * 0.35} V${y + r * 0.35}`} />
    </g>
  );
}

/** Calle, acera, cordón, lindero, colindantes y área verde: el contexto del lote. */
export function SiteContext({ scale, layers }: Props) {
  const u = (px: number) => px / scale;
  return (
    <g>
      {/* Calle y acera */}
      <rect x={0.6} y={51.2} width={38.8} height={2.2} fill="var(--mp-surface-2)" />
      <rect x={0.6} y={46} width={38.8} height={5} fill="url(#pv-hatch-paving)" />
      <path d="M0.6 51 H22 M30.2 51 H39.4 M0.6 51.2 H22.4 M29.8 51.2 H39.4" stroke={INK} strokeWidth={u(1)} fill="none" />
      <path d="M22 51 L22.4 51.2 M30.2 51 L29.8 51.2 M22 46.6 H30.2" stroke={MUTED} strokeWidth={u(0.7)} strokeDasharray="0.4 0.25" fill="none" />
      <path d="M0.6 52.9 H39.4" stroke={MUTED} strokeWidth={u(0.8)} strokeDasharray="1.6 1" />
      <text x={20} y={52.55} fontSize={0.62} fill={MUTED} textAnchor="middle" fontStyle="italic">Calle (demostración)</text>
      <text x={36.2} y={47.1} fontSize={0.5} fill={MUTED} textAnchor="middle">Acera</text>
      {TREES_STREET.map(([x, y]) => <Tree key={`s${x}`} x={x} y={y} r={1.1} u={u} />)}
      {/* Colindantes */}
      <path d="M0.6 6 H8 M32 6 H39.4 M0.6 46 H8 M32 46 H39.4" stroke={MUTED} strokeWidth={u(0.7)} fill="none" />
      <text transform="translate(4 27) rotate(-90)" fontSize={0.55} fill={MUTED} textAnchor="middle">Lote colindante · Finca 083072</text>
      <text transform="translate(35.8 27) rotate(90)" fontSize={0.55} fill={MUTED} textAnchor="middle">Lote colindante · Finca 083074</text>
      {/* Área verde posterior */}
      <rect x={8} y={6} width={24} height={6} fill="url(#pv-hatch-green)" />
      {TREES_GARDEN.map(([x, y]) => <Tree key={`g${x}`} x={x} y={y} r={1.3} u={u} />)}
      <text x={20} y={11.4} fontSize={0.55} fill={MUTED} textAnchor="middle">Área verde</text>
      {/* Lindero del lote: trazo y punto */}
      {layers.boundary ? (
        <g>
          <rect x={8} y={6} width={24} height={40} fill="none" stroke={INK} strokeWidth={u(1.6)} strokeDasharray="1.4 0.3 0.25 0.3" />
          {([[8, 6], [32, 6], [32, 46], [8, 46]] as const).map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={u(3)} fill="var(--mp-plan-paper)" stroke={INK} strokeWidth={u(1)} />
          ))}
        </g>
      ) : null}
    </g>
  );
}
