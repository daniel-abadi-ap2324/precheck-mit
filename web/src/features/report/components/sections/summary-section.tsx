import { complianceMeta, conSupuestoMeta, toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ReportModel } from "../../lib/report-model";

/** Conteos por estado e índice preliminar. Nunca un «cumple» global. */
export function SummarySection({ model }: { model: ReportModel }) {
  const { counts } = model;
  // Un «no cumple» con supuesto (ADR-0016) va en su fila: está por confirmar, no es una falla firme.
  const rows = [
    { key: "PASS", meta: complianceMeta.PASS, n: counts.pass },
    { key: "FAIL", meta: complianceMeta.FAIL, n: counts.fail - counts.conSupuesto },
    ...(counts.conSupuesto ? [{ key: "SUPUESTO", meta: conSupuestoMeta, n: counts.conSupuesto }] : []),
    { key: "WARNING", meta: complianceMeta.WARNING, n: counts.warning },
    { key: "MANUAL_REVIEW", meta: complianceMeta.MANUAL_REVIEW, n: counts.manual },
  ];
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Se evaluaron <strong className="tabular">{counts.total}</strong> reglas. Índice preliminar de cumplimiento:{" "}
        <strong className="tabular">{counts.index} %</strong> ({counts.pass} de {counts.total}). El índice no equivale a aprobación ni a dictamen.
      </p>
      {model.precheck.fuenteResultado ? <p className="text-ink-muted">Fuente de los estados: {model.precheck.fuenteResultado}.</p> : null}
      <table className="w-full max-w-md">
        <caption className="sr-only">Reglas evaluadas por estado</caption>
        <tbody>
          {rows.map(({ key, meta, n }) => {
            const Icon = meta.icon;
            return (
              <tr key={key} className="border-b last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  <span className={cn("inline-flex items-center gap-1.5", toneClasses[meta.tone].text)}>
                    <Icon aria-hidden className="size-4" />
                    {meta.label}
                  </span>
                </th>
                <td className="tabular py-1 text-right">{n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
