import type { RuleResult } from "@/hooks/use-rule-results";
import type { Tone } from "@/lib/status";
import type { ComplianceStatus, RuleOperator } from "@/types";
import { formatMeasure, formatSigned } from "@/lib/format";

const OPERATOR_SYMBOL: Record<RuleOperator, string> = { "<=": "≤", ">=": "≥", "=": "=", in: "∈", criterio: "" };

export interface MeasurementView {
  detected: string;
  required: string;
  difference: string;
  differenceNote: string | null;
  differenceTone: Tone;
}

const unitOf = ({ rule, result }: RuleResult): string | undefined => result.unit ?? rule.unit ?? undefined;

/** Texto de lo requerido, con operador (p. ej. «≥ 5 m»). En reglas de criterio remite a la cita. */
export function requiredText(item: RuleResult): string {
  const { rule, result } = item;
  const value = result.requiredValue ?? rule.value ?? undefined;
  if (value === undefined || value === null) {
    return rule.operator === "criterio" && rule.regulation.quote ? `Según la norma: «${rule.regulation.quote}»` : "—";
  }
  const symbol = OPERATOR_SYMBOL[rule.operator];
  const measure = formatMeasure(value, unitOf(item));
  return symbol ? `${symbol} ${measure}` : measure;
}

const TONE_BY_STATUS: Record<ComplianceStatus, Tone> = { PASS: "pass", FAIL: "fail", WARNING: "warning", MANUAL_REVIEW: "manual", NOT_APPLICABLE: "neutral" };

/** Nota textual de la diferencia, para no depender del color (WCAG 1.4.1). */
function differenceNote(operator: RuleOperator, diff: number): string | null {
  if (diff === 0) return "justo en el límite";
  if (operator === ">=") return diff < 0 ? "por debajo del mínimo" : "sobre el mínimo";
  if (operator === "<=") return diff > 0 ? "excede el máximo" : "bajo el máximo";
  return diff > 0 ? "por encima de lo requerido" : "por debajo de lo requerido";
}

export function measurementView(item: RuleResult): MeasurementView {
  const { rule, result } = item;
  const unit = unitOf(item);
  return {
    detected: formatMeasure(result.detectedValue ?? undefined, unit),
    required: requiredText(item),
    difference: formatSigned(result.difference ?? undefined, unit),
    differenceNote: result.difference === undefined || result.difference === null ? null : differenceNote(rule.operator, result.difference),
    differenceTone: TONE_BY_STATUS[result.status],
  };
}

export function hasMeasurement({ result }: RuleResult): boolean {
  return result.detectedValue !== undefined && result.detectedValue !== null;
}

const FALLBACK_ACTION: Record<ComplianceStatus, string> = {
  PASS: "No se requiere acción. Conserve la evidencia en el expediente del proyecto.",
  FAIL: "Corrija el plano para cumplir el requisito o documente la excepción aplicable antes de ingresar el trámite.",
  WARNING: "Revise la observación y aclárela en el plano o en la memoria técnica.",
  MANUAL_REVIEW: "Un revisor de la DOYC debe verificar este punto manualmente con los planos y la documentación.",
  NOT_APPLICABLE: "No requiere acción para este proyecto.",
};

export const recommendedAction = ({ result }: RuleResult): string => result.recommendedAction ?? FALLBACK_ACTION[result.status];
