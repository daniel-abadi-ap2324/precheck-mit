import type { RuleResult } from "@/hooks/use-rule-results";
import type { ComplianceResult, ComplianceRule } from "@/types";

/** Regla mínima para pruebas de componentes (sin pasar por los mocks de la API). */
export const fakeRule = (id: string, over: Partial<ComplianceRule> = {}): ComplianceRule => ({
  id,
  version: 1,
  title: `Regla ${id}`,
  category: "parking",
  description: "Descripción de prueba",
  operator: ">=",
  value: 6,
  unit: "m",
  regulation: { id, norma: "Acuerdo N°110 de 22-04-2025", article: "Anexo IV, 4", quote: "ancho mínimo 6.00m libres", sourcePage: 49 },
  state: "aprobada",
  severity: "bloqueante",
  ...over,
});

export const fakeResult = (ruleId: string, status: ComplianceResult["status"], over: Partial<ComplianceResult> = {}): ComplianceResult => ({
  ruleId,
  status,
  official: true,
  ...over,
});

export const fakeItem = (
  id: string,
  status: ComplianceResult["status"],
  over: { rule?: Partial<ComplianceRule>; result?: Partial<ComplianceResult> } = {},
): RuleResult => ({ rule: fakeRule(id, over.rule), result: fakeResult(id, status, over.result) });
