import { ToneBadge } from "@/components/status";
import type { ComplianceRule, RuleState } from "@/types";
import { cn } from "@/lib/utils";
import { catalogLabel, ruleStateMeta } from "../lib/rule-meta";

export function RuleStateBadge({ state }: { state: RuleState }) {
  return <ToneBadge meta={ruleStateMeta[state]} size="sm" />;
}

/** Real = regla del catálogo (reglas/*.json); Demostración = inventada para el prototipo. */
export function CatalogTag({ rule }: { rule: ComplianceRule }) {
  const label = catalogLabel(rule);
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-xs whitespace-nowrap", rule.demo ? "border-dashed border-input text-ink-muted" : "border-line bg-muted text-foreground")}>
      {label}
    </span>
  );
}
