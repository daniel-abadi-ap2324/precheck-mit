"use client";

import type { RuleResult } from "@/hooks/use-rule-results";
import { ComplianceBadge, FueraDeCatalogoTag, UnofficialTag } from "@/components/status";
import { isOfficialResult } from "@/lib/official";
import { cn } from "@/lib/utils";
import type { AccionRevision } from "@/types";
import { MarcaDeRegla } from "@/features/marcadores/components/guardar-marcador";
import { RevisionMark } from "./revision-mark";

interface RuleCardProps {
  item: RuleResult;
  selected: boolean;
  tabbable: boolean;
  onActivate: (id: string) => void;
  /** Respuesta del revisor DOYC a la decisión de la IA (PreCheck real). */
  revision?: AccionRevision;
}

/** Fila de regla: título, ID y estado con icono + texto visible (y «no oficial» si aplica). Es una opción de la lista. */
export function RuleCard({ item, selected, tabbable, onActivate, revision }: RuleCardProps) {
  const { rule, result } = item;
  const official = isOfficialResult(item);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-rule-id={rule.id}
      onClick={() => onActivate(rule.id)}
      className={cn(
        "flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left outline-offset-[-2px] transition-colors hover:bg-muted",
        selected ? "border-l-brand bg-brand-soft hover:bg-brand-soft" : "border-l-transparent",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("line-clamp-2 text-compact leading-snug text-ink", selected && "font-medium")}>{rule.title}</span>
        <span className="tabular truncate text-xs text-ink-muted">{rule.id}</span>
        <span className="flex flex-wrap items-center gap-1">
          <ComplianceBadge status={result.status} official={official} faltaEnPlano={result.faltaEnPlano} conSupuesto={result.conSupuesto} size="sm" />
          {official ? null : <UnofficialTag />}
          {result.fueraDeCatalogo ? <FueraDeCatalogoTag /> : null}
          <RevisionMark accion={revision} />
          <MarcaDeRegla ruleId={rule.id} />
        </span>
      </span>
    </button>
  );
}
