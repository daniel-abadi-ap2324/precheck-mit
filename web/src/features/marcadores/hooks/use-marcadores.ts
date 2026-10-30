"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { borrarMarcador, editarMarcador, guardarMarcador, leerMarcadores, type CambiosMarcador, type EntradaMarcador } from "@/services/marcadores/cliente";

/** Marcadores guardados (todos, o los de un proyecto). Una sola petición por proyecto, compartida por la lista y el detalle. */
export const useMarcadores = (projectId?: string) => useQuery({ queryKey: queryKeys.marcadores(projectId), queryFn: () => leerMarcadores(projectId) });

/** Guardar, editar y quitar refrescan todas las listas de marcadores (la del proyecto, la página y el panel). */
export function useCambiarMarcadores() {
  const client = useQueryClient();
  const refrescar = () => client.invalidateQueries({ queryKey: queryKeys.marcadores() });
  const fallo = (titulo: string) => (e: Error) => toast.error(titulo, { description: e.message });
  return {
    guardar: useMutation({
      mutationFn: (e: EntradaMarcador) => guardarMarcador(e),
      onSuccess: (m) => {
        void refrescar();
        toast.success(m.tipo === "equivocada" ? "Guardada como equivocada" : "Guardada como interesante", { description: m.foto.regla?.titulo ?? "Conclusión del dictamen" });
      },
      onError: fallo("No se pudo guardar el marcador."),
    }),
    editar: useMutation({
      mutationFn: ({ id, cambios }: { id: string; cambios: CambiosMarcador }) => editarMarcador(id, cambios),
      onSuccess: () => void refrescar(),
      onError: fallo("No se pudo cambiar el marcador."),
    }),
    quitar: useMutation({
      mutationFn: (id: string) => borrarMarcador(id),
      onSuccess: () => {
        void refrescar();
        toast.success("Marcador quitado");
      },
      onError: fallo("No se pudo quitar el marcador."),
    }),
  };
}
