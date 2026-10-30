interface GridProps {
  width: number;
  height: number;
  scale: number;
}

/** Retícula de 1 m con líneas mayores cada 5 m (papel de plano). */
export function PlanGrid({ width, height, scale }: GridProps) {
  const u = (px: number) => px / scale;
  const xs = Array.from({ length: Math.floor(width) + 1 }, (_, i) => i);
  const ys = Array.from({ length: Math.floor(height) + 1 }, (_, i) => i);
  return (
    <g aria-hidden stroke="var(--mp-plan-grid)">
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} strokeWidth={u(x % 5 === 0 ? 0.9 : 0.4)} />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} strokeWidth={u(y % 5 === 0 ? 0.9 : 0.4)} />
      ))}
    </g>
  );
}
