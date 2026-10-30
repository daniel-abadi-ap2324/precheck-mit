import { complianceMeta, toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import { gaugeAriaLabel, gaugeSegments } from "../lib/gauge";
import type { StatusCounts } from "../lib/results-model";

/**
 * Índice preliminar de cumplimiento: barra apilada de los cuatro estados, leyenda en texto
 * y tabla oculta para lectores de pantalla. No es una aprobación ni un «cumple» global.
 */
export function ComplianceGauge({ counts, index }: { counts: StatusCounts; index: number }) {
  const segments = gaugeSegments(counts);
  const visible = segments.filter((s) => s.count > 0);
  return (
    <section aria-labelledby="indice-titulo" className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="indice-titulo" className="text-sm font-medium text-muted-foreground">
          Índice preliminar de cumplimiento
        </h2>
        <p className="text-xs text-muted-foreground">Proporción de reglas evaluadas que cumplen. No equivale a aprobación.</p>
      </div>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-3xl font-semibold tracking-tight">{index} %</span>
        <span className="tabular text-sm text-muted-foreground">
          {counts.PASS} de {counts.total} reglas evaluadas
        </span>
      </p>

      <div role="img" aria-label={gaugeAriaLabel(counts, index)} className="mt-3 flex h-3 w-full gap-0.5 bg-card">
        {visible.map((s, i) => (
          <div
            key={s.status}
            title={`${s.label}: ${s.count} (${s.percent} %)`}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            className={cn(
              "h-full min-w-1",
              toneClasses[complianceMeta[s.status].tone].fill,
              i === 0 && "rounded-l",
              i === visible.length - 1 && "rounded-r",
            )}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-hidden>
        {segments.map((s) => {
          const meta = complianceMeta[s.status];
          const Icon = meta.icon;
          return (
            <li key={s.status} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", toneClasses[meta.tone].fill)} />
              <Icon className={cn("size-3.5", toneClasses[meta.tone].text)} />
              <span>{s.label}</span>
              <span className="tabular text-muted-foreground">
                {s.count} · {s.percent} %
              </span>
            </li>
          );
        })}
      </ul>

      <table className="sr-only">
        <caption>Distribución de las reglas evaluadas por estado</caption>
        <thead>
          <tr>
            <th scope="col">Estado</th>
            <th scope="col">Reglas</th>
            <th scope="col">Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.status}>
              <th scope="row">{s.label}</th>
              <td>{s.count}</td>
              <td>{s.percent} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
