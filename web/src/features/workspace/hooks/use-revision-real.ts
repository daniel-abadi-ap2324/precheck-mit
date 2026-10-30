"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { esPreCheckReal, guardarRevision, leerRevision } from "@/services/prechecks/cliente";
import type { AccionRevision, DecisionRevision } from "@/types";

const SIN_DECISIONES: Record<string, DecisionRevision> = {};

/**
 * Revisión DOYC de un PreCheck real. La lista de reglas y el detalle usan la misma clave de React Query: es una sola
 * petición por PreCheck, no una por regla. En demostración y expedientes no se pide nada.
 */
export function useRevisionReal(precheckId: string | undefined) {
  const activa = Boolean(precheckId && esPreCheckReal(precheckId));
  const query = useQuery({
    queryKey: queryKeys.revision(precheckId ?? ""),
    queryFn: () => leerRevision(precheckId as string),
    enabled: activa,
  });
  return { activa, decisiones: query.data?.decisiones ?? SIN_DECISIONES, query };
}

const MENSAJE: Record<AccionRevision, string> = {
  confirmar: "Decisión de la IA confirmada",
  contradecir: "Desacuerdo con la IA guardado",
  pendiente: "La regla vuelve a quedar pendiente de revisión",
};

/** Guarda la respuesta del revisor a una regla; la respuesta del servidor (la revisión completa) reemplaza la caché. */
export function useGuardarRevision(precheckId: string, ruleId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ accion, nota }: { accion: AccionRevision; nota: string }) => guardarRevision(precheckId, ruleId, accion, nota),
    onSuccess: (revision, { accion }) => {
      client.setQueryData(queryKeys.revision(precheckId), revision);
      toast.success(MENSAJE[accion], { description: ruleId });
    },
    onError: (e) => toast.error("No se pudo guardar la revisión. Intente de nuevo.", { description: e instanceof Error ? e.message : undefined }),
  });
}
