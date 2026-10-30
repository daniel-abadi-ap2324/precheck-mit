import { cn } from "@/lib/utils";

interface ComplianceMeterProps {
  /** Índice preliminar 0–100 (cumple / evaluadas). */
  value: number | undefined;
  className?: string;
  /** Muestra la etiqueta «índice preliminar» junto al valor. */
  showLabel?: boolean;
}

/**
 * Medidor del índice preliminar. Usa el azul de marca y no los colores de estado:
 * un índice alto no es un «cumple» ni una aprobación municipal (plan §0.1).
 */
export function ComplianceMeter({ value, className, showLabel = false }: ComplianceMeterProps) {
  if (value === undefined) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">Sin índice preliminar</span>
      </span>
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="Índice preliminar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct} %, índice preliminar`}
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-brand-soft"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular text-sm text-foreground">{pct} %</span>
      {showLabel ? <span className="text-xs text-muted-foreground">índice preliminar</span> : null}
    </div>
  );
}
