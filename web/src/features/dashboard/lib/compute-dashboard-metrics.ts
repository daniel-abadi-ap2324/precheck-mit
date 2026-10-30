import type { PreCheck, Project, ProjectStatus } from "@/types";
import { countProjectsByStatus } from "@/lib/project-status-counts";

export interface DashboardMetrics {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  completed: number;
  inReview: number;
  /** Suma de reglas «No cumple» en los PreChecks con resultados disponibles. */
  failedRules: number;
  /** Cuántos PreChecks aportan a `failedRules`. */
  precheckCount: number;
  /** Media del índice preliminar de proyectos completados o en revisión; null si no hay ninguno. */
  averageIndex: number | null;
  /** Cuántos proyectos entran en el promedio. */
  indexSample: number;
}

const INDEXED: ReadonlySet<ProjectStatus> = new Set(["COMPLETED", "REVIEW_REQUIRED"]);

/** Métricas del panel. Función pura: no inventa datos que el backend no entregó. */
export function computeDashboardMetrics(projects: readonly Project[], prechecks: readonly PreCheck[]): DashboardMetrics {
  const byStatus = countProjectsByStatus(projects);

  const indexed = projects.filter((p) => INDEXED.has(p.status) && typeof p.complianceIndex === "number");
  const indexSum = indexed.reduce((acc, p) => acc + (p.complianceIndex ?? 0), 0);

  const projectIds = new Set(projects.map((p) => p.id));
  const counted = prechecks.filter((pc) => pc.status === "completed" && projectIds.has(pc.projectId));

  return {
    total: projects.length,
    byStatus,
    completed: byStatus.COMPLETED,
    inReview: byStatus.REVIEW_REQUIRED,
    failedRules: counted.reduce((acc, pc) => acc + pc.summary.failed, 0),
    precheckCount: counted.length,
    averageIndex: indexed.length ? Math.round(indexSum / indexed.length) : null,
    indexSample: indexed.length,
  };
}
