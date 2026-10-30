"use client";

import { useQueries } from "@tanstack/react-query";
import { LECTURA_INTERVALO_MS } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import { api } from "@/services/api";
import type { Plan } from "@/types";

export interface LecturaPlano {
  planId: string;
  fileName: string;
  status: Plan["status"] | "unknown";
  error?: string;
}

/**
 * Estado de lectura de los PDF del asistente, consultado al servidor (cada 3 s mientras se leen). Antes solo se
 * consultaba en el paso «Cargar planos»: si se avanzaba antes de terminar, el plano quedaba «leyendo» para siempre.
 */
export function usePlansReadiness(files: { planId: string; name: string }[]) {
  const consultas = useQueries({
    queries: files.map((f) => ({
      queryKey: queryKeys.plan(f.planId),
      queryFn: () => api.getPlan(f.planId),
      refetchInterval: (q: { state: { data?: Plan } }) => (q.state.data?.status === "processing" ? LECTURA_INTERVALO_MS : false),
    })),
  });
  const planos: LecturaPlano[] = files.map((f, i) => {
    const q = consultas[i];
    return { planId: f.planId, fileName: f.name, status: q.data?.status ?? "unknown", error: q.data?.error ?? (q.error ? q.error.message : undefined) };
  });
  // El que evaluará el motor: el primero ya leído, en el mismo orden que usa el servidor.
  const principal = consultas.find((q) => q.data?.status === "ready" && q.data.extraction)?.data ?? null;
  return {
    planos,
    /** Las lecturas ya listas, en el orden de la lista. */
    lecturas: consultas.flatMap((q) => (q.data?.status === "ready" && q.data.extraction ? [q.data] : [])),
    principal,
    listos: planos.filter((p) => p.status === "ready").length,
    leyendo: planos.some((p) => p.status === "processing" || p.status === "unknown"),
  };
}
