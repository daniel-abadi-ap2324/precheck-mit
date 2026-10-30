import type { ReportModel } from "../../lib/report-model";

/** Alcance de esta verificación (sale siempre, AC-19). */
export function ScopeSection({ model }: { model: ReportModel }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {model.scope.map((s) => (
        <li key={s.id}>
          <strong className="font-semibold">{s.title}.</strong> {s.body}
        </li>
      ))}
    </ul>
  );
}

/** Normas únicas citadas, con artículos y páginas. */
export function ReferencesSection({ model }: { model: ReportModel }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {model.references.map((r) => (
        <li key={r.norma}>
          <span className="font-medium">{r.norma}</span>
          <span className="block text-xs text-ink-muted">
            {r.articles.length ? r.articles.join(", ") : "Sin artículo"}
            {r.pages.length ? ` · pág. ${r.pages.join(", ")}` : ""} · {r.rules} {r.rules === 1 ? "regla" : "reglas"}
          </span>
        </li>
      ))}
    </ul>
  );
}
