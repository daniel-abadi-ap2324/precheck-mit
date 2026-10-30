import { FactList } from "@/components/common";
import { UnofficialTag } from "@/components/status";
import { categoryLabels } from "@/lib/status";
import type { ComplianceRule } from "@/types";
import { formatRuleValue, formatUnit, operatorLabels, zoningLabel } from "../lib/rule-meta";
import { CatalogTag, RuleStateBadge } from "./rule-state-badge";

/** Detalle completo de una regla con su cita literal y la nota de vigencia. */
export function RuleDetail({ rule }: { rule: ComplianceRule }) {
  const { regulation: reg } = rule;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RuleStateBadge state={rule.state} />
        <CatalogTag rule={rule} />
        {rule.state !== "aprobada" ? <UnofficialTag /> : null}
      </div>
      <p>{rule.description}</p>
      <FactList
        rows={[
          ...(rule.normaLabel ? [{ label: "Norma (catálogo)", value: rule.normaCode ? `${rule.normaLabel} · ${rule.normaCode}` : rule.normaLabel }] : []),
          ...(rule.kind ? [{ label: "Tipo", value: rule.kind }] : []),
          { label: "Categoría", value: categoryLabels[rule.category] },
          { label: "Zonificación", value: zoningLabel(rule) },
          { label: "Operador", value: rule.operator === "criterio" && rule.condition ? "Condición (ver abajo)" : operatorLabels[rule.operator] },
          ...(rule.condition ? [{ label: "Condición del motor", value: <code className="text-xs break-all">{rule.condition}</code> }] : []),
          ...(rule.appliesIf ? [{ label: "Aplica si", value: <code className="text-xs break-all">{rule.appliesIf}</code> }] : []),
          { label: "Valor", value: <span className="tabular">{formatRuleValue(rule.value)}</span> },
          { label: "Unidad", value: formatUnit(rule.unit) },
          { label: "Severidad", value: rule.severity === "bloqueante" ? "Bloqueante" : "Observación" },
          { label: "Norma", value: reg.norma },
          { label: "Artículo", value: reg.article },
          ...(reg.sourcePage ? [{ label: "Página", value: reg.sourcePage }] : []),
          ...(rule.validFrom !== undefined ? [{ label: "Vigencia", value: `desde ${rule.validFrom ?? "sin fecha"}${rule.validTo ? ` hasta ${rule.validTo}` : ""}` }] : []),
        ]}
      />
      {reg.quote ? (
        <figure className="flex flex-col gap-1">
          <blockquote className="border-l-2 border-brand bg-muted px-3 py-2 italic">«{reg.quote}»</blockquote>
          <figcaption className="text-xs text-muted-foreground">Cita literal de la fuente.</figcaption>
        </figure>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Regla de demostración: no existe en el catálogo y no tiene cita literal.</p>
      )}
      {rule.note ? <p className="text-xs text-muted-foreground">Nota del catálogo: {rule.note}</p> : null}
      <p className="rounded-md border bg-info-soft px-3 py-2 text-xs">
        Versión {rule.version}. Las reglas no se editan en sitio: cada cambio crea una versión nueva con fecha de vigencia, que debe aprobar un revisor aprobador
        distinto de quien la propone. {rule.state !== "aprobada" ? "Mientras no esté aprobada, sus resultados son indicativos y se marcan «no oficial»." : ""}
      </p>
    </div>
  );
}
