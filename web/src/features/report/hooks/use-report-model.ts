"use client";

import { useMemo } from "react";
import { usePlans, useProject, useProperty } from "@/hooks/use-api";
import { useRuleResults } from "@/hooks/use-rule-results";
import { buildReportModel, type ReportModel, type ReportVersion } from "../lib/report-model";

/** Reúne proyecto, lote, planos y resultados en el modelo del informe (sin JSX). */
export function useReportModel(projectId: string, version: ReportVersion) {
  const project = useProject(projectId);
  const property = useProperty(project.data?.parcelId);
  const plans = usePlans(projectId);
  const results = useRuleResults(project.data?.precheckId);

  const model = useMemo<ReportModel | null>(() => {
    if (!project.data || !results.precheck || results.items.length === 0) return null;
    return buildReportModel({
      version,
      project: project.data,
      property: property.data ?? null,
      plans: plans.data ?? [],
      precheck: results.precheck,
      items: results.items,
      generatedAt: results.precheck.finishedAt ?? results.precheck.startedAt,
    });
  }, [version, project.data, property.data, plans.data, results.precheck, results.items]);

  const hasPrecheck = Boolean(project.data?.precheckId);
  return {
    model,
    hasPrecheck,
    isLoading: project.isLoading || plans.isLoading || property.isLoading || (hasPrecheck && results.isLoading),
    error: project.error ?? results.error ?? plans.error ?? property.error,
    refetch: () => {
      void project.refetch();
      void plans.refetch();
      void property.refetch();
      results.refetch();
    },
  };
}
