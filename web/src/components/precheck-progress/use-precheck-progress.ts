"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";
import { PIPELINE } from "@/lib/pipeline";
import type { PipelineStage } from "@/types";

export const POLL_MS = 400;

/** Consulta el avance cada 400 ms hasta la etapa «done». */
export function usePreCheckProgress(precheckId: string) {
  return useQuery({
    queryKey: queryKeys.progress(precheckId),
    queryFn: () => api.getPreCheckProgress(precheckId),
    enabled: Boolean(precheckId),
    refetchInterval: (query) => (query.state.data?.stage === "done" || query.state.status === "error" ? false : POLL_MS),
    staleTime: 0,
  });
}

export type StageState = "pending" | "current" | "done";

/** Índice de la etapa en curso; con «done», todas quedan completas. */
export function stageIndex(stage: PipelineStage): number {
  return stage === "done" ? PIPELINE.length : Math.max(0, PIPELINE.findIndex((p) => p.stage === stage));
}

export function stageState(i: number, current: number): StageState {
  return i < current ? "done" : i === current ? "current" : "pending";
}
