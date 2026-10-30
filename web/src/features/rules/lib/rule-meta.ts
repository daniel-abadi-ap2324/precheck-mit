import { Archive, CircleCheck, CircleX, FilePen, PauseCircle } from "lucide-react";
import type { StatusMeta } from "@/lib/status";
import type { ComplianceRule, RuleOperator, RuleState } from "@/types";
import { formatNumber } from "@/lib/format";

/** Estados de gobierno de la regla (motor de reglas). No son estados de cumplimiento. */
export const ruleStateMeta: Record<RuleState, StatusMeta> = {
  borrador: { label: "Borrador", tone: "neutral", icon: FilePen },
  aprobada: { label: "Aprobada", tone: "pass", icon: CircleCheck },
  rechazada: { label: "Rechazada", tone: "fail", icon: CircleX },
  retirada: { label: "Retirada", tone: "neutral", icon: Archive },
  suspendida: { label: "Suspendida", tone: "warning", icon: PauseCircle },
};

export const RULE_STATES = Object.keys(ruleStateMeta) as RuleState[];

export const operatorLabels: Record<RuleOperator, string> = {
  "<=": "≤ (máximo)",
  ">=": "≥ (mínimo)",
  "=": "= (igual)",
  in: "en (lista)",
  criterio: "Criterio",
};

export const operatorSymbol = (op: RuleOperator): string => ({ "<=": "≤", ">=": "≥", "=": "=", in: "en", criterio: "Criterio" })[op];

/**
 * Operador para la tabla: una regla evaluable cuya condición no es «dato op número» (rango, desigualdad estricta,
 * fórmula) dice «Condición» y la condición literal va en el detalle; nunca se reduce a un operador aproximado.
 */
export const ruleOperatorText = (rule: Pick<ComplianceRule, "operator" | "condition">): string =>
  rule.operator === "criterio" && rule.condition ? "Condición" : operatorSymbol(rule.operator);

export const formatUnit = (unit: string | null | undefined): string => (unit ? (unit === "m2" ? "m²" : unit) : "—");

export const formatRuleValue = (value: number | null | undefined): string => (value === null || value === undefined ? "—" : formatNumber(value));

export const catalogLabel = (rule: ComplianceRule): "Real" | "Demostración" => (rule.demo ? "Demostración" : "Real");

export const zoningLabel = (rule: ComplianceRule): string => rule.zoning ?? "General";

function shortNorma(norma: string): string {
  const plot = /Anexo\s+(\d+)\s+PLOT/i.exec(norma);
  if (plot) return `Anexo ${plot[1]} PLOT`;
  const acuerdo = /Acuerdo\s+N°?\s*(\d+)/i.exec(norma);
  if (acuerdo) return `Acuerdo ${acuerdo[1]}`;
  return norma;
}

/** Fuente compacta para la tabla: norma + artículo; las reglas de demostración no tienen fuente. */
export function ruleSource(rule: ComplianceRule): string {
  if (rule.demo) return "Demostración";
  const { norma, article } = rule.regulation;
  const art = /^\d/.test(article) ? `Art. ${article}` : article;
  const corta = shortNorma(norma);
  return `${corta !== norma ? corta : (rule.normaLabel ?? norma)} · ${art}`;
}
