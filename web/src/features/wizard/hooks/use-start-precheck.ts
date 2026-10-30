"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import type { DatosMotor } from "@/services/prechecks/cliente";
import { useWizardStore } from "@/stores/wizard";

/** Los planos primero: el servidor evalúa el primero leído y los documentos complementarios completan sus datos. */
const esDoc = (files: { planId?: string; complementario?: boolean }[], id: string) => Boolean(files.find((f) => f.planId === id)?.complementario);

/** Inicia el PreCheck y lleva a la pantalla de procesamiento. */
export function useStartPreCheck() {
  const router = useRouter();
  return useMutation({
    mutationFn: async (datos?: DatosMotor) => {
      const { projectId, files } = useWizardStore.getState();
      if (!projectId) throw new Error("No hay un proyecto creado. Vuelva al paso «Ubicar el lote».");
      const { precheckId } = await api.startPreCheck(projectId, datos, files.flatMap((f) => (f.format === "PDF" && f.status === "uploaded" && f.planId ? [f.planId] : [])).sort((a, b) => Number(esDoc(files, a)) - Number(esDoc(files, b))));
      return { projectId, precheckId };
    },
    onSuccess: ({ projectId, precheckId }) => {
      useWizardStore.getState().setRun(projectId, precheckId);
      router.push(`/projects/${projectId}/processing?run=${encodeURIComponent(precheckId)}`);
    },
  });
}
