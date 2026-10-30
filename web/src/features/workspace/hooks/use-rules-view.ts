"use client";

import { useMemo } from "react";
import type { RuleResult } from "@/hooks/use-rule-results";
import { resumenPorZona } from "@/lib/agrupar-zona";
import { isOfficialResult } from "@/lib/official";
import { useWorkspaceStore } from "@/stores/workspace";
import { countByStatus, filterResults, groupByCategory, visibleRuleIds } from "../lib/filter-results";

const SIN_AGRUPADAS: RuleResult[] = [];

/**
 * Vista derivada del panel de reglas: filtros del store aplicados a los resultados. Las `agrupadas` (otras zonas
 * por confirmar) cuentan en «Requiere revisión» como en el informe, pero se listan en una sola línea (`porZona`),
 * visible con el filtro «Todos» o «Requiere revisión» y sin búsqueda.
 */
export function useRulesView(items: RuleResult[], agrupadas: RuleResult[] = SIN_AGRUPADAS) {
  const statusFilter = useWorkspaceStore((s) => s.statusFilter);
  const search = useWorkspaceStore((s) => s.search);
  const collapsed = useWorkspaceStore((s) => s.collapsedCategories);
  const counts = useMemo(() => countByStatus([...items, ...agrupadas]), [items, agrupadas]);
  // La línea lleva el estado de las agrupadas: «Requiere revisión» o, con la decisión de respaldo del motor, el de esta.
  const zona = useMemo(() => resumenPorZona(agrupadas), [agrupadas]);
  const porZona = agrupadas.length && (statusFilter === "ALL" || statusFilter === zona.status) && !search.trim() ? agrupadas.length : 0;
  const filtered = useMemo(() => filterResults(items, { status: statusFilter, search }), [items, statusFilter, search]);
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const visibleIds = useMemo(() => visibleRuleIds(groups, collapsed), [groups, collapsed]);
  const hasUnofficial = useMemo(() => [...items, ...agrupadas].some((i) => !isOfficialResult(i)), [items, agrupadas]);
  const total = items.length + agrupadas.length;
  return { counts, groups, visibleIds, collapsed, total, shown: filtered.length + porZona, hasUnofficial, porZona, zona };
}

export function useSelectedItem(items: RuleResult[]): RuleResult | null {
  const selected = useWorkspaceStore((s) => s.selectedRuleId);
  return useMemo(() => items.find((i) => i.rule.id === selected) ?? null, [items, selected]);
}
