"use client";

import { useQuery } from "@tanstack/react-query";
import { LECTURA_INTERVALO_MS } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import { revisadaPorPersona } from "@/lib/regiones";
import { leerRegionesPlano } from "@/services/planos/regiones";

export interface RegionesRevisadas {
  total: number;
  revisadas: number;
  /** La propuesta automática todavía corre: «sin regiones» sería prematuro. */
  proponiendo: boolean;
}

/**
 * Cuántas regiones tiene el plano que evaluará el PreCheck y cuántas revisó una persona. Comparte la consulta con el
 * editor de regiones del paso «Cargar planos», así que lo guardado allí se ve aquí sin esperar. `null` mientras no se
 * sabe (sin plano o consultando): el aviso no debe parpadear.
 */
export function useRegionesRevisadas(planId: string | null): RegionesRevisadas | null {
  const { data } = useQuery({
    queryKey: queryKeys.planRegions(planId ?? ""),
    queryFn: () => leerRegionesPlano(planId as string),
    enabled: Boolean(planId),
    // La propuesta automática puede seguir en curso al llegar a este paso.
    refetchInterval: (q) => (q.state.data?.propuesta.status === "processing" ? LECTURA_INTERVALO_MS : false),
  });
  if (!planId || !data) return null;
  const regiones = data.regiones?.regiones ?? [];
  return { total: regiones.length, revisadas: regiones.filter(revisadaPorPersona).length, proponiendo: data.propuesta.status === "processing" };
}
