import type { Project, ProjectStatus } from "@/types";

/** Conteo en cero para cada estado de proyecto (lo comparten el panel y el listado de proyectos). */
export function emptyStatusCounts(): Record<ProjectStatus, number> {
  return { DRAFT: 0, PROCESSING: 0, REVIEW_REQUIRED: 0, COMPLETED: 0, FAILED: 0 };
}

/** Cuántos proyectos hay en cada estado. */
export function countProjectsByStatus(projects: readonly Pick<Project, "status">[]): Record<ProjectStatus, number> {
  const counts = emptyStatusCounts();
  for (const p of projects) counts[p.status] += 1;
  return counts;
}
