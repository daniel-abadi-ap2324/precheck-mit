import type { RuleResult } from "@/hooks/use-rule-results";
import { ComplianceBadge, FueraDeCatalogoTag, UnofficialTag } from "@/components/status";
import { DecisionDictamenDetalle } from "@/components/expediente";
import { formatMeasure, formatSigned } from "@/lib/format";
import { resumenPorZona, separarPorZona } from "@/lib/agrupar-zona";
import { isOfficialResult } from "@/lib/official";
import { Muted } from "../report-section";

/** Detalle por regla (solo versión del revisor): estado, valores y referencia. */
export function RuleTable({ items: todas, empty }: { items: RuleResult[]; empty: string }) {
  if (todas.length === 0) return <Muted>{empty}</Muted>;
  // Las reglas de otras zonas que solo dependen de confirmar el código de zona van en una línea (ADR-0012).
  const { detalle: items, porZona } = separarPorZona(todas);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-lg text-sm">
        <thead className="text-left text-ink-muted">
          <tr className="border-b">
            <th scope="col" className="py-1 pr-2 font-medium">
              Estado
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Regla
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Detectado
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Diferencia
            </th>
            <th scope="col" className="py-1 font-medium">
              Referencia
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const { rule, result } = item;
            const official = isOfficialResult(item);
            return (
              <tr key={rule.id} className="break-inside-avoid border-b align-top last:border-0">
                <td className="py-1.5 pr-2">
                  <span className="flex flex-col items-start gap-1">
                    <ComplianceBadge status={result.status} official={official} faltaEnPlano={result.faltaEnPlano} conSupuesto={result.conSupuesto} size="sm" />
                    {official ? null : <UnofficialTag />}
                    {result.fueraDeCatalogo ? <FueraDeCatalogoTag /> : null}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  {rule.title}
                  <span className="tabular block text-xs text-ink-muted">{rule.id}</span>
                  {result.dictamen ? (
                    <div className="mt-1.5 text-xs">
                      <DecisionDictamenDetalle result={result} />
                    </div>
                  ) : null}
                </td>
                <td className="tabular py-1.5 pr-2">{formatMeasure(result.detectedValue ?? undefined, result.unit ?? undefined)}</td>
                <td className="tabular py-1.5 pr-2">{formatSigned(result.difference ?? undefined, result.unit ?? undefined)}</td>
                <td className="py-1.5 text-xs">
                  {rule.demo ? "Regla de demostración, sin cita" : `${rule.regulation.article} · ${rule.regulation.norma}`}
                  {result.explanation && result.status === "MANUAL_REVIEW" && !result.dictamen ? <span className="mt-1 block text-ink-muted">Motivo: {result.explanation}</span> : null}
                </td>
              </tr>
            );
          })}
          {porZona.length > 0 ? (
            <tr data-testid="fila-zona-por-confirmar" className="break-inside-avoid border-b align-top last:border-0">
              <td className="py-1.5 pr-2">
                <ComplianceBadge status={resumenPorZona(porZona).status} official={false} size="sm" />
              </td>
              <td colSpan={4} className="py-1.5 text-sm">
                {resumenPorZona(porZona).texto}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
