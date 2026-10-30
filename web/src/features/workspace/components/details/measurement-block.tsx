import type { RuleResult } from "@/hooks/use-rule-results";
import { toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import { measurementView } from "../../lib/rule-copy";

/** Detectado / Requerido / Diferencia. La diferencia lleva signo, color y una nota en texto. */
export function MeasurementBlock({ item }: { item: RuleResult }) {
  const v = measurementView(item);
  const tone = toneClasses[v.differenceTone];
  return (
    <dl className="grid grid-cols-3 divide-x rounded-md border bg-card">
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        <dt className="text-xs text-ink-muted">Detectado</dt>
        <dd className="tabular text-base font-semibold text-ink">{v.detected}</dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        <dt className="text-xs text-ink-muted">Requerido</dt>
        <dd className="tabular text-sm font-semibold break-words text-ink">{v.required}</dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        <dt className="text-xs text-ink-muted">Diferencia</dt>
        <dd className={cn("tabular text-base font-semibold", v.differenceNote ? tone.text : "text-ink")}>{v.difference}</dd>
        {v.differenceNote ? <dd className={cn("text-xs", tone.text)}>{v.differenceNote}</dd> : null}
      </div>
    </dl>
  );
}
