import type { ReactNode } from "react";
import { metaNivel, ORDEN_NIVELES } from "@/features/compare/components/clasificacion-tag";
import { toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { NivelCorrida } from "@/services/rondas/tipos";
import { formatoPorcentaje } from "../lib/rondas";

/** Etiqueta pequeña (modelo, plano, tanda, commit). */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border border-line bg-muted px-1.5 py-0.5 text-xs text-foreground", className)}>{children}</span>;
}

/** Un porcentaje (0–1) o «—» si no hay con qué medirlo. */
export const Porcentaje = ({ valor, vacio = "—" }: { valor: number | null; vacio?: string }) =>
  valor === null ? <span className="text-muted-foreground">{vacio}</span> : <span className="tabular font-medium">{formatoPorcentaje(valor)}</span>;

/** «2 estándar · 1 rarísima»: cuántas corridas hay de cada nivel, con el icono y el color de cada uno. */
export function Niveles({ niveles, className }: { niveles: Record<NivelCorrida, number>; className?: string }) {
  const hay = ORDEN_NIVELES.filter((n) => niveles[n] > 0);
  if (!hay.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", className)}>
      {hay.map((n) => {
        const m = metaNivel(n);
        const Icono = m.icono;
        return (
          <span key={n} className={cn("inline-flex items-center gap-0.5", toneClasses[m.tono].text)}>
            <Icono aria-hidden className="size-3" />
            <span className="tabular">{niveles[n]}</span> {m.etiqueta.toLowerCase()}
          </span>
        );
      })}
    </span>
  );
}

/** Icono, color y texto del nivel de una corrida (o «sin medir»). */
export function NivelCorto({ nivel }: { nivel: NivelCorrida | null }) {
  if (!nivel) return <span className="text-2xs text-muted-foreground">sin medir</span>;
  const m = metaNivel(nivel);
  const Icono = m.icono;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-2xs", toneClasses[m.tono].text)} title={m.ayuda}>
      <Icono aria-hidden className="size-3" />
      {m.etiqueta}
    </span>
  );
}
