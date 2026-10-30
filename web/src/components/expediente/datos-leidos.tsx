import { CircleHelp, Gauge } from "lucide-react";
import type { DatoExpediente } from "@/types";
import { toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";

const pct = (n: number) => `${Math.round(n * 100)} %`;

/**
 * Datos leídos del expediente por el agente revisor-planos: valor, confianza y fuente (documento, página y
 * método). Una confianza bajo el mínimo del motor se marca con icono, color y texto: ese dato no decide reglas.
 */
export function DatosLeidos({
  datos,
  umbral,
  label,
  compacto = false,
  className,
}: {
  datos: DatoExpediente[];
  umbral: number | null;
  label: string;
  /** Sin la fuente (resúmenes laterales); la pestaña Lote la muestra completa. */
  compacto?: boolean;
  className?: string;
}) {
  if (datos.length === 0) return <p className={cn("text-sm text-muted-foreground", className)}>No constan datos leídos del plano.</p>;
  return (
    <ul aria-label={label} className={cn("divide-y rounded-md border", className)}>
      {datos.map((d) => {
        const bajo = d.confianza !== undefined && umbral !== null && d.confianza < umbral;
        return (
          <li key={d.clave} className="space-y-1 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">{d.etiqueta}</span>
              <span className={cn("text-sm font-medium break-words", !d.valor && "font-normal text-muted-foreground italic")}>{d.valor || "no consta"}</span>
            </div>
            {d.confianza !== undefined ? (
              <p className={cn("flex items-center gap-1 text-xs", bajo ? toneClasses.manual.text : "text-muted-foreground")}>
                {bajo ? <CircleHelp aria-hidden className="size-3.5 shrink-0" /> : <Gauge aria-hidden className="size-3.5 shrink-0" />}
                <span>
                  Confianza {pct(d.confianza)}
                  {bajo ? ` · bajo el mínimo del motor (${pct(umbral ?? 0)}): requiere revisión` : ""}
                </span>
              </p>
            ) : null}
            {d.fuente && !compacto ? <p className="text-xs break-words text-muted-foreground">Fuente: {d.fuente}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
