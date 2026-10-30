"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { EmptyState, LinkButton, PreliminaryNotice } from "@/components/common";
import { PreCheckProgress } from "@/components/precheck-progress";
import { queryKeys } from "@/lib/query-keys";
import { useWizardStore } from "@/stores/wizard";
import { useAutoRedirect } from "../hooks/use-auto-redirect";

/** Pantalla de procesamiento: sigue el PreCheck y, al terminar, lleva a la revisión. */
export function ProcessingScreen({ projectId, run }: { projectId: string; run: string | null }) {
  const queryClient = useQueryClient();
  const [finished, setFinished] = useState(false);
  const redirect = useAutoRedirect(`/projects/${projectId}/precheck`, finished);

  const onDone = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    const wizard = useWizardStore.getState();
    if (wizard.projectId === projectId) wizard.reset();
    setFinished(true);
  }, [projectId, queryClient]);

  if (!run) {
    return (
      <EmptyState
        icon={FileSearch}
        title="No hay un PreCheck en curso"
        body="Esta página muestra el avance de un análisis recién iniciado. Inicie uno desde el asistente o abra el resumen del proyecto."
        action={
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <LinkButton href="/projects/new">Nuevo PreCheck</LinkButton>
            <LinkButton href={`/projects/${projectId}`} variant="outline">
              Resumen del proyecto
            </LinkButton>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PreCheckProgress
        precheckId={run}
        projectId={projectId}
        onDone={onDone}
        doneNote={
          redirect.active ? (
            <p>
              Abriendo la revisión…{" "}
              <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={redirect.cancel}>
                Quedarme en esta página
              </button>
            </p>
          ) : null
        }
      />
      <PreliminaryNotice compact />
    </div>
  );
}
