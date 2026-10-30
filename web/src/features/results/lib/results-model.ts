import type { RuleResult } from "@/hooks/use-rule-results";
import { isOfficialResult } from "@/lib/official";
import { categoryLabels } from "@/lib/status";
import type { ComplianceStatus, RuleCategory, RuleOperator } from "@/types";

/** Estados que se evalúan en la vista de resultados (NO_APLICA solo va en la vista técnica). */
export const EVALUATED_STATUSES = ["PASS", "FAIL", "WARNING", "MANUAL_REVIEW"] as const;
export type EvaluatedStatus = (typeof EVALUATED_STATUSES)[number];

/** Opciones del filtro, en el orden del encargo (Todos / No cumple / Observación / Cumple / Requiere revisión). */
export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "FAIL", label: "No cumple" },
  { value: "WARNING", label: "Observación" },
  { value: "PASS", label: "Cumple" },
  { value: "MANUAL_REVIEW", label: "Requiere revisión" },
];
export type StatusFilter = EvaluatedStatus | "ALL";

export function parseStatusFilter(raw: string | null | undefined): StatusFilter {
  return (EVALUATED_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as EvaluatedStatus) : "ALL";
}

/** Fila plana de la tabla: todo lo que se ordena, filtra o muestra, sin JSX. */
export interface ResultRow {
  id: string;
  status: ComplianceStatus;
  official: boolean;
  /** Hallazgo que propone la IA fuera del catálogo: un revisor debe validarlo. */
  fueraDeCatalogo?: boolean;
  /** NO_CUMPLE de contenido del plano: «No cumple · falta en el plano». */
  faltaEnPlano?: boolean;
  /** NO_CUMPLE que descansa en un supuesto (ADR-0016). */
  conSupuesto?: boolean;
  category: RuleCategory;
  categoryLabel: string;
  title: string;
  detected?: number;
  required?: number;
  operator: RuleOperator;
  unit?: string;
  difference?: number;
  norma: string;
  article: string;
  sourcePage?: number;
  demo: boolean;
  /** Con dictamen: valor leído y límite que escribió el arquitecto revisor, y el estado que había dado el motor. */
  valorLeido?: string;
  limite?: string;
  motorStatus?: ComplianceStatus;
  /** Texto normalizado para la búsqueda (sin tildes, en minúsculas). */
  haystack: string;
}

export const normalizeText = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const orUndefined = (n: number | null | undefined): number | undefined => (n === null || n === undefined ? undefined : n);

export function toResultRow(item: RuleResult): ResultRow {
  const { rule, result } = item;
  const categoryLabel = categoryLabels[rule.category];
  return {
    id: rule.id,
    status: result.status,
    official: isOfficialResult(item),
    ...(result.fueraDeCatalogo ? { fueraDeCatalogo: true } : {}),
    ...(result.faltaEnPlano ? { faltaEnPlano: true } : {}),
    ...(result.conSupuesto ? { conSupuesto: true } : {}),
    category: rule.category,
    categoryLabel,
    title: rule.title,
    detected: orUndefined(result.detectedValue),
    required: orUndefined(result.requiredValue ?? rule.value),
    operator: rule.operator,
    unit: result.unit ?? rule.unit ?? undefined,
    difference: orUndefined(result.difference),
    norma: rule.regulation.norma,
    article: rule.regulation.article,
    sourcePage: rule.regulation.sourcePage,
    demo: Boolean(rule.demo),
    ...(result.dictamen?.valorLeido ? { valorLeido: result.dictamen.valorLeido } : {}),
    ...(result.dictamen?.limite ? { limite: result.dictamen.limite } : {}),
    ...(result.motorStatus ? { motorStatus: result.motorStatus } : {}),
    haystack: normalizeText(`${rule.title} ${rule.id} ${categoryLabel} ${rule.regulation.norma} ${rule.regulation.article}`),
  };
}

export function filterRows(rows: ResultRow[], status: StatusFilter, query: string): ResultRow[] {
  const q = normalizeText(query);
  return rows.filter((r) => (status === "ALL" || r.status === status) && (!q || r.haystack.includes(q)));
}

export interface StatusCounts {
  total: number;
  PASS: number;
  FAIL: number;
  WARNING: number;
  MANUAL_REVIEW: number;
}

export function countByStatus(statuses: ComplianceStatus[]): StatusCounts {
  const counts: StatusCounts = { total: 0, PASS: 0, FAIL: 0, WARNING: 0, MANUAL_REVIEW: 0 };
  for (const s of statuses) {
    if (s === "NOT_APPLICABLE") continue;
    counts[s] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Índice preliminar = cumple / evaluadas, redondeado. Nunca es una aprobación. */
export const preliminaryIndex = (c: StatusCounts): number => (c.total === 0 ? 0 : Math.round((c.PASS / c.total) * 100));

export const operatorSymbol: Record<RuleOperator, string> = { "<=": "≤", ">=": "≥", "=": "=", in: "∈", criterio: "Criterio" };

/** Orden ascendente con los valores vacíos siempre al final (la tabla invierte la dirección). */
export function compareOptionalNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

export const STATUS_ORDER: Record<ComplianceStatus, number> = { FAIL: 0, WARNING: 1, MANUAL_REVIEW: 2, PASS: 3, NOT_APPLICABLE: 4 };
