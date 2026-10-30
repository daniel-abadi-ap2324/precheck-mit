interface Props {
  scale: number;
}

const INK = "var(--mp-ink)";
const MUTED = "var(--mp-ink-muted)";
const X0 = 11.5, X1 = 28.8, Y0 = 14, Y1 = 41.75, WALL = 0.3;
const COL_X = [X0, 17.3, 23.05, X1];
const COL_Y = [Y0, 20.9, 27.85, 34.8, Y1];

/** Muros exteriores con poché: rectángulo exterior menos el interior (evenodd). */
const wallPath = `M${X0} ${Y0} H${X1} V${Y1} H${X0} Z M${X0 + WALL} ${Y0 + WALL} V${Y1 - WALL} H${X1 - WALL} V${Y0 + WALL} Z`;

function Stair({ u }: { u: (n: number) => number }) {
  const treads = Array.from({ length: 11 }, (_, i) => 24.3 + i * 0.6);
  return (
    <g stroke={INK} strokeWidth={u(0.7)} fill="none">
      <rect x={17.6} y={24} width={2.6} height={6.9} />
      {treads.map((y) => <line key={y} x1={17.6} y1={y} x2={20.2} y2={y} />)}
      <path d="M18.9 30.4 V24.6 M18.6 25 L18.9 24.6 L19.2 25" />
    </g>
  );
}

function Lifts({ u }: { u: (n: number) => number }) {
  return (
    <g stroke={INK} strokeWidth={u(0.7)} fill="none">
      {[24, 26.3].map((y) => (
        <g key={y}>
          <rect x={20.6} y={y} width={2.1} height={2.1} />
          <path d={`M20.6 ${y} L22.7 ${y + 2.1} M22.7 ${y} L20.6 ${y + 2.1}`} strokeWidth={u(0.5)} />
        </g>
      ))}
    </g>
  );
}

/** Planta baja de la torre: muros, columnas, núcleo, tabiques, rampa y accesos. */
export function Building({ scale }: Props) {
  const u = (px: number) => px / scale;
  return (
    <g>
      {/* Línea de sótano (oculta) */}
      <rect x={12} y={16} width={16} height={14} fill="none" stroke={MUTED} strokeWidth={u(0.8)} strokeDasharray="0.6 0.35" />
      <text x={12.3} y={16.8} fontSize={0.45} fill={MUTED}>Línea de sótano</text>
      {/* Tabiques interiores */}
      <path d={`M${X0} 31.4 H17.3 M23.05 31.4 H${X1} M17.3 23.6 V34.8 M23.05 23.6 V31.4 M${X0} 37.2 H15.2 M15.2 37.2 V${Y1}`} stroke={INK} strokeWidth={u(1)} fill="none" />
      <Stair u={u} />
      <Lifts u={u} />
      {/* Muros y columnas */}
      <path d={wallPath} fillRule="evenodd" fill="url(#pv-hatch-wall)" stroke={INK} strokeWidth={u(1.4)} />
      {COL_X.flatMap((x) => COL_Y.map((y) => <rect key={`${x}-${y}`} x={x - 0.25} y={y - 0.25} width={0.5} height={0.5} fill={INK} />))}
      {/* Rampa vehicular al sótano */}
      <rect x={25.5} y={33} width={5.5} height={8.75} fill="var(--mp-plan-paper)" stroke={INK} strokeWidth={u(1.2)} />
      {[34.2, 35.4, 36.6, 37.8, 39, 40.2].map((y) => <line key={y} x1={25.5} y1={y} x2={31} y2={y} stroke={MUTED} strokeWidth={u(0.5)} />)}
      <path d="M28.25 40.4 V33.6 M27.85 34.1 L28.25 33.6 L28.65 34.1" stroke={INK} strokeWidth={u(0.9)} fill="none" />
      <text x={28.25} y={41.35} fontSize={0.45} fill={INK} textAnchor="middle">Baja 12 %</text>
      {/* Accesos: entrada vehicular y peatonal */}
      <rect x={25.5} y={41.75} width={5.5} height={4.25} fill="url(#pv-hatch-paving)" stroke={MUTED} strokeWidth={u(0.6)} />
      <rect x={13} y={41.75} width={3} height={4.25} fill="url(#pv-hatch-paving)" stroke={MUTED} strokeWidth={u(0.6)} />
      <path d="M13 42.4 H16 M13 43 H16" stroke={MUTED} strokeWidth={u(0.5)} />
      <path d="M13.2 41.75 A1.4 1.4 0 0 1 14.6 40.35 V41.75" stroke={INK} strokeWidth={u(0.6)} fill="none" />
      <path d={`M${X0 - 0.4} 43 H18`} stroke={MUTED} strokeWidth={u(0.6)} strokeDasharray="0.5 0.3" fill="none" />
      {/* Rótulos de recintos */}
      <g fontSize={0.55} fill={INK} textAnchor="middle">
        <text x={14.4} y={27.8}>Local 1</text>
        <text x={25.9} y={27.8}>Local 2</text>
        <text x={20.2} y={36.6}>Vestíbulo</text>
        <text x={13.35} y={39.6}>Garita</text>
        <text x={20.2} y={22.6}>Núcleo</text>
        <text x={20.2} y={18.6} fontSize={0.7} fontWeight={600}>Torre · 18 pisos</text>
        <text x={20.2} y={19.5} fontSize={0.45} fill={MUTED}>NPT +0.30</text>
      </g>
    </g>
  );
}
