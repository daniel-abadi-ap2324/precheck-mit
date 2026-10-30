"use client";

import { useQuery } from "@tanstack/react-query";
import { validarDatosUsuario, type DatosAValidar } from "@/services/planos/cliente";

/**
 * Avisos sobre los datos del usuario (zona que no existe en la norma, finca mal escrita…). Corre cuando la lectura ya
 * tiene datos y se repite al cambiar uno; no cuesta nada (no usa IA). Si falla, no avisa: nunca bloquea la ejecución.
 */
export function useValidarDatos(datos: DatosAValidar, activo: boolean) {
  const q = useQuery({
    queryKey: ["validar-datos", datos],
    queryFn: () => validarDatosUsuario(datos),
    enabled: activo && Object.values(datos).some(Boolean),
    staleTime: 60_000,
    retry: false,
  });
  return q.data ?? [];
}
