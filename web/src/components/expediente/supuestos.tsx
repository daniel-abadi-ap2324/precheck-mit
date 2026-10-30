import { CircleDashed } from "lucide-react";
import type { ExpedienteInfo } from "@/types";
import { queSeSupuso } from "@/lib/supuestos";
import { cn } from "@/lib/utils";

/**
 * «Qué se supuso en esta revisión» (ADR-0016): zona de trabajo y su procedencia, zonas descartadas, datos supuestos,
 * reglas vigentes, avisos del motor y, si la IA no terminó, con qué se armó el resultado. Va arriba, con o sin dictamen.
 */
export function QueSeSupuso({ info, className, titulo = true }: { info: ExpedienteInfo; className?: string; titulo?: boolean }) {
  const s = queSeSupuso(info);
  if (!s) return null;
  return (
    <section
      // En el informe la sección que lo envuelve ya lleva el id (y el título).
      id={titulo ? "que-se-supuso" : undefined}
      aria-labelledby={titulo ? "que-se-supuso-titulo" : undefined}
      aria-label={titulo ? undefined : "Qué se supuso en esta revisión"}
      data-testid="que-se-supuso"
      className={cn("flex scroll-mt-20 flex-col gap-2 rounded-md border border-dashed border-supuesto/40 bg-supuesto-soft p-3 text-sm", className)}
    >
      {titulo ? (
        <h3 id="que-se-supuso-titulo" className="flex items-center gap-1.5 font-semibold">
          <CircleDashed aria-hidden className="size-4 text-supuesto" />
          Qué se supuso en esta revisión
        </h3>
      ) : null}
      {s.iaFallida ? (
        <p role="alert" data-testid="ia-fallida" className="rounded-md border border-fail/40 bg-fail-soft px-2.5 py-2 text-ink">
          {s.iaFallida}
        </p>
      ) : null}
      {s.zona ? (
        <div data-testid="zona-de-trabajo">
          <p>{s.zona.texto}</p>
          {s.zona.accion ? <p className="mt-0.5 font-medium">{s.zona.accion}</p> : null}
        </div>
      ) : null}
      {s.descartadas.length ? (
        <div>
          <h4 className="font-medium">Zonas descartadas</h4>
          <ul className="mt-1 list-disc pl-5" aria-label="Zonas descartadas">
            {s.descartadas.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.supuestos.length ? (
        <div>
          <h4 className="font-medium">Datos supuestos</h4>
          <ul className="mt-1 list-disc pl-5" aria-label="Datos supuestos">
            {s.supuestos.map((x) => (
              <li key={x.id}>
                <span className="tabular text-ink-muted">{x.id}</span> {x.texto} {x.reglas ? `(${x.reglas} ${x.reglas === 1 ? "regla" : "reglas"}).` : ""} {x.accion ?? ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.vigentes ? (
        <div data-testid="reglas-vigentes">
          <h4 className="font-medium">Reglas vigentes de esta corrida</h4>
          <p className="mt-1">{s.vigentes.resumen}</p>
          <ul className="mt-1 list-disc pl-5" aria-label="Alcance y permisos">
            {s.vigentes.detalle.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.avisos.length ? (
        <div data-testid="avisos-motor">
          <h4 className="font-medium">Avisos del motor</h4>
          <ul className="mt-1 list-disc pl-5" aria-label="Avisos del motor">
            {s.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.conteo ? <p className="text-xs text-ink-muted" data-testid="conteo-final">{s.conteo}</p> : null}
    </section>
  );
}
