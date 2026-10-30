import { cn } from "@/lib/utils";

/**
 * Escala 0–100 del índice preliminar con marcas cada 25 %. Relleno en azul de marca sobre
 * pista del mismo tono: comunica magnitud, no un veredicto de cumplimiento.
 */
export function IndexScale({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex flex-col gap-1", className)} aria-hidden>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-brand-soft">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute top-0 h-full w-0.5 bg-card" style={{ left: `${t}%` }} />
        ))}
      </div>
      <div className="tabular flex justify-between text-2xs text-muted-foreground">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}
