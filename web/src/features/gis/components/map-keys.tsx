import { cn } from "@/lib/utils";

/**
 * Claves de leyenda. Son rectángulos apaisados, líneas y puntos (nunca cuadrados vacíos ni círculos con
 * borde) para que no se confundan con casillas o botones de opción.
 */
export function AreaKey({ fill, line, dashed, className }: { fill: string | null; line: string; dashed?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3 w-5 shrink-0 rounded-[3px]", className)}
      style={{ backgroundColor: fill ? `${fill}b3` : "transparent", border: `1.5px ${dashed ? "dashed" : "solid"} ${line}` }}
    />
  );
}

export function StripeKey({ colors }: { colors: string[] }) {
  return (
    <span aria-hidden className="inline-flex h-3 w-5 shrink-0 overflow-hidden rounded-[3px] border border-ink/30">
      {colors.map((c) => (
        <span key={c} className="h-full flex-1" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

export function LineKey({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block h-0 w-5 shrink-0 border-t-2 border-dashed", className)} />;
}

export function PointKey({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} />;
}

/** Línea con color explícito (capas cuyo color no es un token). */
export function StrokeKey({ color, dashed, width = 2 }: { color: string; dashed?: boolean; width?: number }) {
  return <span aria-hidden className="inline-block h-0 w-5 shrink-0" style={{ borderTop: `${width}px ${dashed ? "dashed" : "solid"} ${color}` }} />;
}

/** Área con trama diagonal (hojas pendientes de vectorizar). */
export function HatchKey({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-5 shrink-0 rounded-[3px]"
      style={{ border: `1.5px dashed ${color}`, backgroundImage: `repeating-linear-gradient(135deg, ${color}99 0 1.5px, transparent 1.5px 5px)` }}
    />
  );
}
