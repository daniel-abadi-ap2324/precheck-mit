"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { ProjectInput } from "@/schemas/project";
import { useWizardStore } from "@/stores/wizard";

/** Nombre provisional del proyecto: el del primer plano, sin extensión («Casco Antiguo.pdf» → «Casco Antiguo»). */
export const nombreProvisional = (archivo?: string) => {
  const base = archivo?.replace(/\.[^.]+$/, "").trim() ?? "";
  return base.length >= 3 ? base.slice(0, 120) : `Plano del ${new Date().toLocaleDateString("es-PA")}`;
};

/**
 * Crea el proyecto en cuanto se elige el primer plano (los planos se cargan contra un proyecto). No pide datos: la
 * finca, el área, la zona y lo demás salen de la lectura del plano. Si ya existe uno para el borrador, lo reutiliza.
 */
export function useEnsureProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (archivo?: string): Promise<string> => {
      const { projectId } = useWizardStore.getState();
      if (projectId) return projectId;
      const input = { name: nombreProvisional(archivo), propertyId: "", finca: "", address: "", corregimiento: "", projectType: "", applicant: "", parcelId: "", zoningCode: "" };
      const project = await api.createProject(input as unknown as ProjectInput);
      return project.id;
    },
    onSuccess: (projectId) => {
      useWizardStore.getState().setRun(projectId, "");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
