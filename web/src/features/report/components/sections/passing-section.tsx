import type { ReportModel } from "../../lib/report-model";

/** Reglas que cumplen: conteo por categoría; el revisor ve además los títulos. */
export function PassingSection({ model }: { model: ReportModel }) {
  const revisor = model.version === "revisor";
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {model.counts.pass} reglas cumplen{revisor ? " de forma indicativa" : ""}. {revisor ? "Detalle por categoría:" : "Conteo por tema, sin detalle por regla:"}
      </p>
      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {model.passByCategory.map((c) => (
          <li key={c.category} className="break-inside-avoid">
            <span className="font-medium">{c.label}</span> <span className="tabular text-ink-muted">({c.count})</span>
            {revisor ? <span className="block text-xs text-ink-muted">{c.titles.join(" · ")}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
