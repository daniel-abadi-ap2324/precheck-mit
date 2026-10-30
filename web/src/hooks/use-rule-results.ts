"use client";

import { useMemo } from "react";
import type { ComplianceResult, ComplianceRule } from "@/types";
import { usePreCheck, useRules } from "./use-api";

export interface RuleResult {
  rule: ComplianceRule;
  result: ComplianceResult;
}

/**
 * Une cada resultado con su regla (cita, norma, categoría). Las reglas que trae el propio PreCheck (tal como se
 * evaluaron, p. ej. las de zonas exceptuadas de un expediente real) tienen prioridad sobre el catálogo.
 */
export function unirResultados(results: ComplianceResult[], catalogo: ComplianceRule[], propias: ComplianceRule[] = []): RuleResult[] {
  const byId = new Map(catalogo.map((r) => [r.id, r]));
  for (const r of propias) byId.set(r.id, r);
  return results.flatMap((result) => {
    const rule = byId.get(result.ruleId);
    return rule ? [{ rule, result }] : [];
  });
}

/** Resultados del PreCheck con su regla. Lógica fuera del JSX. */
export function useRuleResults(precheckId: string | null | undefined) {
  const precheck = usePreCheck(precheckId);
  const rules = useRules();
  const items = useMemo<RuleResult[]>(() => {
    if (!precheck.data || !rules.data) return [];
    return unirResultados(precheck.data.results, rules.data, precheck.data.rules);
  }, [precheck.data, rules.data]);
  return {
    items,
    precheck: precheck.data,
    isLoading: precheck.isLoading || rules.isLoading,
    error: precheck.error ?? rules.error,
    refetch: () => {
      void precheck.refetch();
      void rules.refetch();
    },
  };
}
