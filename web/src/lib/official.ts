import type { ComplianceResult, ComplianceRule } from "@/types";

/**
 * Un resultado es oficial solo si el motor lo marca así Y su regla está aprobada.
 * Resultado de regla no aprobada = «no oficial» (CONTEXT.md, «Resultado indicativo»),
 * aunque el dato de origen diga lo contrario. Único punto de cálculo para toda la UI.
 */
export function isOfficialResult({ rule, result }: { rule: Pick<ComplianceRule, "state">; result: Pick<ComplianceResult, "official"> }): boolean {
  return result.official && rule.state === "aprobada";
}
