"use client";

import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useProjects } from "@/hooks/use-api";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { esCorridaDePrueba } from "@/lib/corridas-prueba";
import type { PreCheck } from "@/types";
import { computeDashboardMetrics } from "../lib/compute-dashboard-metrics";

function combinePrechecks(results: UseQueryResult<PreCheck>[]) {
  return { data: results.flatMap((r) => (r.data ? [r.data] : [])), pending: results.some((r) => r.isPending) };
}

/** Proyectos + PreChecks disponibles → métricas del panel. */
export function useDashboardData() {
  const projectsQuery = useProjects();
  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data]);
  // Las corridas de prueba de modelos (cientos) no se leen una por una: saturaban el navegador y bloqueaban el cambio de página.
  const precheckIds = projects.flatMap((p) => (p.precheckId && p.status !== "PROCESSING" && !esCorridaDePrueba(p) ? [p.precheckId] : []));

  const prechecks = useQueries({
    queries: precheckIds.map((id) => ({ queryKey: queryKeys.precheck(id), queryFn: () => api.getPreCheck(id) })),
    combine: combinePrechecks,
  });

  const metrics = useMemo(() => computeDashboardMetrics(projects, prechecks.data), [projects, prechecks.data]);

  return {
    projects,
    metrics,
    isLoading: projectsQuery.isPending,
    prechecksLoading: prechecks.pending,
    error: projectsQuery.error,
    refetch: projectsQuery.refetch,
  };
}
