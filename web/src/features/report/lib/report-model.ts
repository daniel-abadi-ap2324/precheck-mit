import type { RuleResult } from "@/hooks/use-rule-results";
import { categoryLabels } from "@/lib/status";
import { queSeSupuso, type QueSeSupuso } from "@/lib/supuestos";
import type { DictamenInfo, Plan, PreCheck, Project, Property, RuleCategory } from "@/types";
import { composeObservations, type Observation } from "./observations";
import { buildReferences, type NormReference } from "./references";
import { buildScope, type ScopeItem } from "./scope";

export type ReportVersion = "revisor" | "profesional";

export interface ReportCounts {
  total: number;
  pass: number;
  fail: number;
  warning: number;
  manual: number;
  /** De los «no cumple», los que descansan en un supuesto (ADR-0016): están por confirmar. */
  conSupuesto: number;
  /** Índice preliminar = cumple / evaluadas. Nunca es aprobación. */
  index: number;
}

export interface CategoryCount {
  category: RuleCategory;
  label: string;
  count: number;
  titles: string[];
}

export interface ReportModel {
  version: ReportVersion;
  project: Project;
  property: Property | null;
  plans: Plan[];
  precheck: PreCheck;
  generatedAt: string;
  counts: ReportCounts;
  failing: RuleResult[];
  warnings: RuleResult[];
  manual: RuleResult[];
  passing: RuleResult[];
  passByCategory: CategoryCount[];
  observations: Observation[];
  scope: ScopeItem[];
  references: NormReference[];
  /** Dictamen del arquitecto revisor del expediente (conclusión y supuestos), si lo hay. */
  dictamen: DictamenInfo | null;
  /** «Qué se supuso en esta revisión» (ADR-0016): zona de trabajo, supuestos, vigentes, avisos; null si no hay nada. */
  supuestos: QueSeSupuso | null;
  /** Solo se emite la versión del profesional con el expediente revisado (AC-05). */
  canIssue: boolean;
  pendingReview: string[];
}

export interface ReportInput {
  version: ReportVersion;
  project: Project;
  property: Property | null;
  plans: Plan[];
  precheck: PreCheck;
  items: RuleResult[];
  generatedAt: string;
}

const byStatus = (items: RuleResult[], s: string) => items.filter((i) => i.result.status === s);

function groupPassing(passing: RuleResult[]): CategoryCount[] {
  const map = new Map<RuleCategory, string[]>();
  for (const { rule } of passing) map.set(rule.category, [...(map.get(rule.category) ?? []), rule.title]);
  return [...map].map(([category, titles]) => ({ category, label: categoryLabels[category], count: titles.length, titles }));
}

export function buildReportModel(input: ReportInput): ReportModel {
  const { items, property, project } = input;
  const failing = byStatus(items, "FAIL");
  const warnings = byStatus(items, "WARNING");
  const manual = byStatus(items, "MANUAL_REVIEW");
  const passing = byStatus(items, "PASS");
  const total = failing.length + warnings.length + manual.length + passing.length;
  const zoneWithoutCeus = property && !property.ceus ? (property.zoning?.code ?? property.parcel.zoningCode) : null;
  const observations = composeObservations(items, zoneWithoutCeus);
  const pendingIndications = observations.filter((o) => o.indicationPending).length;
  const conSupuesto = failing.filter((i) => i.result.conSupuesto).length;

  return {
    ...input,
    counts: {
      total,
      pass: passing.length,
      fail: failing.length,
      conSupuesto,
      warning: warnings.length,
      manual: manual.length,
      index: total ? Math.round((passing.length / total) * 100) : 0,
    },
    failing,
    warnings,
    manual,
    passing,
    passByCategory: groupPassing(passing),
    observations,
    scope: buildScope(items, property, project),
    references: buildReferences(items),
    dictamen: project.expediente?.dictamen ?? null,
    supuestos: project.expediente ? queSeSupuso(project.expediente) : null,
    canIssue: project.status === "COMPLETED",
    pendingReview: [
      `${failing.length + manual.length} resultados por decidir (${failing.length} no cumple${conSupuesto ? `, de ellos ${conSupuesto} con supuesto por confirmar` : ""}, ${manual.length} requieren revisión)`,
      "Visto bueno del Revisor DOYC",
      ...(pendingIndications ? [`${pendingIndications} indicaciones al profesional por redactar`] : []),
    ],
  };
}
