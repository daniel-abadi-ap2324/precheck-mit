/** Patrones compartidos del visor (unidades en metros del plano). */
export function PlanDefs() {
  return (
    <defs>
      <pattern id="pv-hatch-wall" width="0.35" height="0.35" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="0.35" stroke="var(--mp-ink)" strokeWidth="0.06" />
      </pattern>
      <pattern id="pv-hatch-green" width="0.9" height="0.9" patternUnits="userSpaceOnUse">
        <circle cx="0.2" cy="0.2" r="0.05" fill="var(--mp-pass)" opacity="0.55" />
        <circle cx="0.65" cy="0.62" r="0.05" fill="var(--mp-pass)" opacity="0.55" />
      </pattern>
      <pattern id="pv-hatch-paving" width="0.6" height="0.6" patternUnits="userSpaceOnUse">
        <path d="M0 0.6 L0.6 0.6 M0.6 0 L0.6 0.6" stroke="var(--mp-line-strong)" strokeWidth="0.03" fill="none" />
      </pattern>
      <pattern id="pv-hatch-dim" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="0.5" stroke="var(--mp-dimension)" strokeWidth="0.07" />
      </pattern>
    </defs>
  );
}
