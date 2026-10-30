"use client";

import type { RuleResult } from "@/hooks/use-rule-results";
import type { ExpedienteInfo } from "@/types";
import { ErrorBoundary } from "@/components/common";
import { VisorPaginasExpediente, paginaDeResultado } from "@/components/expediente";
import { RulesPanel } from "../rules/rules-panel";
import { RuleDetails } from "../details/rule-details";
import { PlanPanel } from "../plan-panel";
import { useRevisionReal } from "../../hooks/use-revision-real";

/** Expediente o PreCheck real: su documento reemplaza al plano de demostración. Expedientes (exp-…): solo lectura; PreCheck real (pck-…): Revisión DOYC. */
export interface ExpedienteWorkspace {
  projectId: string;
  info: ExpedienteInfo;
}

export interface WorkspaceData {
  items: RuleResult[];
  selected: RuleResult | null;
  precheckId: string;
  /** Reglas de otras zonas que dependen de confirmar el código de zona: se muestran en una sola línea. */
  agrupadas?: RuleResult[];
  expediente?: ExpedienteWorkspace;
}

/**
 * Cada panel lleva su propio ErrorBoundary: un fallo en el visor no tumba la lista ni el detalle. La revisión DOYC
 * (PreCheck real) se lee aquí una vez y baja por props a las filas: una petición por PreCheck, no una por regla.
 */
export function RulesPane({ items, agrupadas, precheckId, onRuleActivated }: { items: RuleResult[]; agrupadas?: RuleResult[]; precheckId?: string; onRuleActivated?: (id: string) => void }) {
  const { decisiones } = useRevisionReal(precheckId);
  return (
    <ErrorBoundary>
      <RulesPanel items={items} agrupadas={agrupadas} revision={decisiones} onRuleActivated={onRuleActivated} />
    </ErrorBoundary>
  );
}

export function PlanPane({ selected, expediente }: { selected: RuleResult | null; expediente?: ExpedienteWorkspace }) {
  return (
    <ErrorBoundary>
      {expediente ? (
        <VisorPaginasExpediente projectId={expediente.projectId} info={expediente.info} inicial={paginaDeResultado(selected?.result)} marcas={selected?.result.marcas} />
      ) : (
        <PlanPanel item={selected} />
      )}
    </ErrorBoundary>
  );
}

export function DetailsPane({ selected, precheckId, expediente }: { selected: RuleResult | null; precheckId: string; expediente?: ExpedienteWorkspace }) {
  return (
    <ErrorBoundary>
      <div className="h-full overflow-y-auto bg-card">
        <RuleDetails item={selected} precheckId={precheckId} soloLectura={Boolean(expediente)} expediente={expediente} />
      </div>
    </ErrorBoundary>
  );
}
