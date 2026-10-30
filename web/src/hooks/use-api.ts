"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ProjectQuery } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import type { CambioDato } from "@/services/planos/cliente";

/** Hooks de lectura compartidos por varios módulos. Los hooks propios de cada módulo viven en features/<módulo>/hooks. */
// Los expedientes reales cambian cuando el agente revisor-planos vuelve a evaluar: se releen al volver a la pestaña.
export const useProjects = (q: ProjectQuery = {}) =>
  useQuery({ queryKey: queryKeys.projects(q), queryFn: () => api.listProjects(q), staleTime: 0, refetchOnWindowFocus: true });
export const useProject = (id: string) => useQuery({ queryKey: queryKeys.project(id), queryFn: () => api.getProject(id), enabled: Boolean(id) });
export const useProperty = (parcelId: string | null | undefined) =>
  useQuery({ queryKey: queryKeys.property(parcelId ?? ""), queryFn: () => api.getProperty(parcelId as string), enabled: Boolean(parcelId) });
export const usePreCheck = (id: string | null | undefined) =>
  useQuery({ queryKey: queryKeys.precheck(id ?? ""), queryFn: () => api.getPreCheck(id as string), enabled: Boolean(id) });
export const useRules = () => useQuery({ queryKey: queryKeys.rules(), queryFn: () => api.listRules(), staleTime: Infinity });
export const useZonings = () => useQuery({ queryKey: queryKeys.zonings(), queryFn: () => api.listZonings(), staleTime: Infinity });
/** Mientras el servidor lee un plano PDF, se vuelve a consultar cada 3 s. */
export const LECTURA_INTERVALO_MS = 3000;
export const usePlans = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.plans(projectId),
    queryFn: () => api.listPlans(projectId),
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === "processing") ? LECTURA_INTERVALO_MS : false),
  });
export const usePlan = (planId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.plan(planId ?? ""),
    queryFn: () => api.getPlan(planId as string),
    enabled: Boolean(planId),
    refetchInterval: (q) => (q.state.data?.status === "processing" ? LECTURA_INTERVALO_MS : false),
  });
/** Corrige, agrega o confirma datos leídos de un plano PDF; el PreCheck usará lo corregido o confirmado. */
export function useCorrectPlanData(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: Record<string, CambioDato>) => api.correctPlanData(planId, cambios),
    onSuccess: (plan) => {
      qc.setQueryData(queryKeys.plan(planId), plan);
      void qc.invalidateQueries({ queryKey: queryKeys.plans(plan.projectId) });
    },
  });
}
export const useNotifications = () => useQuery({ queryKey: queryKeys.notifications(), queryFn: () => api.listNotifications() });
export const useReviewers = () => useQuery({ queryKey: queryKeys.reviewers(), queryFn: () => api.listReviewers(), staleTime: Infinity });
