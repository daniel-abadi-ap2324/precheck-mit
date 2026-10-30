"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { estadoRevisionIa, leerRegistroIa, guardarConfigIa, leerConfigIa, pedirRevisionIa, type PedidoXtra } from "@/services/ia/cliente";

const CLAVE_CONFIG = ["ia-config"] as const;
const claveEstado = (id: string) => ["ia-estado", id] as const;
/** Mientras la IA trabaja se consulta cada 5 s (Claude Code puede tardar varios minutos). */
const INTERVALO_MS = 5000;

export const useConfigIa = () => useQuery({ queryKey: CLAVE_CONFIG, queryFn: leerConfigIa });

export function useGuardarConfigIa() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: guardarConfigIa, onSuccess: (config) => qc.setQueryData(CLAVE_CONFIG, config) });
}

/** Registro de la revisión: se refresca cada 5 s mientras la IA trabaja. */
export const useRegistroIa = (precheckId: string, activo: boolean, trabajando: boolean) =>
  useQuery({ queryKey: ["ia-registro", precheckId], queryFn: () => leerRegistroIa(precheckId), enabled: activo, refetchInterval: trabajando ? INTERVALO_MS : false });

/** Estado de la revisión con IA de un PreCheck. Al terminar, vuelve a pedir el PreCheck para mostrar el dictamen. */
export function useRevisionIa(precheckId: string) {
  const qc = useQueryClient();
  const estado = useQuery({
    queryKey: claveEstado(precheckId),
    queryFn: () => estadoRevisionIa(precheckId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? INTERVALO_MS : false),
  });
  const previo = useRef(estado.data?.status);
  useEffect(() => {
    const ahora = estado.data?.status;
    if (previo.current === "running" && ahora && ahora !== "running") void qc.invalidateQueries({ queryKey: queryKeys.precheck(precheckId) });
    previo.current = ahora;
  }, [estado.data?.status, precheckId, qc]);
  const pedir = useMutation({
    mutationFn: (p: { modelo?: string; xtra?: PedidoXtra } = {}) => pedirRevisionIa(precheckId, p.modelo, p.xtra),
    onSuccess: (ia) => qc.setQueryData(claveEstado(precheckId), ia),
  });
  return { estado, pedir };
}
