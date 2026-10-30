"use client";

import { SearchX } from "lucide-react";
import type { RuleResult } from "@/hooks/use-rule-results";
import type { DecisionRevision } from "@/types";
import { EmptyState, PreliminaryNotice } from "@/components/common";
import { ComplianceIcon, UnofficialTag } from "@/components/status";
import { FUENTE_DICTAMEN, FUENTE_RESPALDO } from "@/lib/dictamen";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspace";
import { useRulesView } from "../../hooks/use-rules-view";
import { ResultsSummary } from "./results-summary";
import { RuleFilters } from "./rule-filters";
import { RuleList } from "./rule-list";

interface RulesPanelProps {
  items: RuleResult[];
  /** Reglas de otras zonas que dependen de confirmar el código de zona (lib/agrupar-zona.ts): una sola línea. */
  agrupadas?: RuleResult[];
  /** Se llama al elegir una regla con clic o Enter (p. ej. para abrir el drawer de detalle en tableta). */
  onRuleActivated?: (id: string) => void;
  /** Revisión DOYC del PreCheck real, por id de regla: marca las filas confirmadas o contradichas por el revisor. */
  revision?: Record<string, DecisionRevision>;
}

export function RulesPanel({ items, agrupadas = [], onRuleActivated, revision }: RulesPanelProps) {
  const view = useRulesView(items, agrupadas);
  const todas = [...items, ...agrupadas];
  const conDictamen = todas.some((i) => i.result.dictamen && i.result.dictamen.origen !== "motor");
  const conRespaldo = !conDictamen && todas.some((i) => i.result.dictamen?.origen === "motor");
  const statusFilter = useWorkspaceStore((s) => s.statusFilter);
  const setStatusFilter = useWorkspaceStore((s) => s.setStatusFilter);
  const setSearch = useWorkspaceStore((s) => s.setSearch);
  const selectRule = useWorkspaceStore((s) => s.selectRule);
  const activate = (id: string) => {
    selectRule(id);
    onRuleActivated?.(id);
  };

  return (
    <section aria-labelledby="rules-panel-title" className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex flex-col gap-3 border-b p-3">
        <h2 id="rules-panel-title" className="text-base font-semibold tracking-tight">Resultados del PreCheck</h2>
        <PreliminaryNotice compact />
        {view.hasUnofficial ? (
          <p role="note" className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
            <UnofficialTag className="shrink-0" />
            <span>Resultados indicativos: las reglas usadas están en borrador y aún no son oficiales.</span>
          </p>
        ) : null}
        {conDictamen || conRespaldo ? <p className="text-xs text-ink-muted">Fuente de los estados: {conDictamen ? FUENTE_DICTAMEN : FUENTE_RESPALDO}.</p> : null}
        <ResultsSummary counts={view.counts} active={statusFilter} onFilter={setStatusFilter} />
        <RuleFilters />
        <p aria-live="polite" className="tabular text-xs text-ink-muted">
          {view.shown === view.total ? `${view.total} reglas evaluadas` : `Mostrando ${view.shown} de ${view.total} reglas`}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view.groups.length || view.porZona ? (
          <>
            {view.groups.length ? <RuleList groups={view.groups} visibleIds={view.visibleIds} collapsed={view.collapsed} onActivate={activate} revision={revision} /> : null}
            {view.porZona ? (
              <p data-testid="linea-zona-por-confirmar" className="flex items-start gap-2 border-t px-3 py-2 text-xs text-ink">
                <ComplianceIcon status={view.zona.status} className="mt-0.5 size-3.5" />
                <span>
                  {view.zona.texto} <UnofficialTag className="ml-1" />
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            className="m-3"
            icon={SearchX}
            title="Ninguna regla coincide"
            body="Cambie la búsqueda o el filtro de estado."
            action={
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("ALL"); }}>
                Limpiar filtros
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}
