interface LabelChipProps {
  x: number;
  y: number;
  text: string;
  scale: number;
  /** Anclaje horizontal del chip respecto a (x, y). */
  anchor?: "start" | "middle" | "end";
  tone?: "dimension" | "ink";
}

/** Rótulo de tamaño constante en pantalla (12 px), con fondo de papel para leerse sobre la línea. */
export function LabelChip({ x, y, text, scale, anchor = "middle", tone = "dimension" }: LabelChipProps) {
  const u = (px: number) => px / scale;
  const fontSize = u(12);
  const width = u(text.length * 6.4 + 12);
  const height = u(19);
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const color = tone === "dimension" ? "var(--mp-dimension)" : "var(--mp-ink)";
  return (
    <g>
      <rect x={left} y={y - height / 2} width={width} height={height} rx={u(3)} fill="var(--mp-sheet)" stroke={color} strokeWidth={u(1)} />
      <text x={left + width / 2} y={y} fontSize={fontSize} fill={color} stroke="none" textAnchor="middle" dominantBaseline="central" fontWeight={600} className="tabular">
        {text}
      </text>
    </g>
  );
}
