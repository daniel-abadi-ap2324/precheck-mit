"use client";

import type { LectorOcr } from "@/lib/lector-ocr";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";

/** Anteproyectos de ejemplo disponibles en el servidor (PLANOS_EJEMPLO_DIR). */
export const usePlanExamples = () => useQuery({ queryKey: queryKeys.planExamples(), queryFn: () => api.listPlanExamples(), staleTime: Infinity });

/** Agrega un ejemplo al proyecto: el servidor lo lee como si se hubiera cargado. */
/** Sin proyecto, `asegurar` lo crea antes (el asistente lo crea con el primer plano). */
export function useAddPlanExample(projectId: string | null, asegurar?: (nombre: string) => Promise<string>, ocr?: LectorOcr) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => {
      const proyecto = projectId ?? (asegurar ? await asegurar(nombre) : null);
      if (!proyecto) throw new Error("No hay un proyecto para el plano.");
      const plan = await api.addPlanExample(proyecto, nombre, ocr);
      void qc.invalidateQueries({ queryKey: queryKeys.plans(proyecto) });
      return plan;
    },
  });
}
