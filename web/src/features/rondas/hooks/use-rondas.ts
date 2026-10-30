"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { leerRondas, recalcularMetricas } from "@/services/rondas/cliente";

export const useRondas = () => useQuery({ queryKey: queryKeys.rondas(), queryFn: leerRondas, staleTime: 0 });

/** «Recalcular métricas»: al terminar, vuelve a leer las rondas. */
export function useRecalcularMetricas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recalcularMetricas,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.rondas() }),
  });
}
