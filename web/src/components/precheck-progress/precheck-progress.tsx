"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ErrorState, SkeletonRows } from "@/components/common";
import { Progress } from "@/components/ui/progress";
import { PIPELINE } from "@/lib/pipeline";
import { PipelineList } from "./pipeline-list";
import { PreCheckDone } from "./precheck-done";
import { stageIndex, usePreCheckProgress } from "./use-precheck-progress";

export interface PreCheckProgressProps {
  precheckId: string;
  projectId: string;
  /** Se llama una sola vez cuando el análisis llega a «done». */
  onDone?: () => void;
  /** Texto extra bajo las acciones finales (p. ej. aviso de redirección). */
  doneNote?: ReactNode;
}

/** Avance del PreCheck: etapas, porcentaje y resumen final. */
export function PreCheckProgress({ precheckId, projectId, onDone, doneNote }: PreCheckProgressProps) {
  const progress = usePreCheckProgress(precheckId);
  const data = progress.data;
  const done = data?.stage === "done";
  const notified = useRef(false);

  useEffect(() => {
    if (done && !notified.current) {
      notified.current = true;
      onDone?.();
    }
  }, [done, onDone]);

  if (progress.error) return <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />;
  if (!data) return <SkeletonRows rows={8} />;

  const current = stageIndex(data.stage);
  const label = done ? "PreCheck terminado." : `Etapa ${current + 1} de ${PIPELINE.length}: ${PIPELINE[current].label}.`;

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" role="status" className="sr-only">
        {label}
      </p>
      {done ? (
        <PreCheckDone projectId={projectId} note={doneNote} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Analizando el proyecto…</h2>
              <p className="text-sm text-muted-foreground" aria-hidden>
                {label}
                {data.stage === "checks" ? <span className="tabular"> Regla {data.ruleIndex} de {data.ruleTotal}.</span> : null}
              </p>
            </div>
            <p className="tabular text-4xl font-semibold tracking-tight" aria-hidden>
              {data.percent}
              <span className="ml-0.5 text-xl text-muted-foreground">%</span>
            </p>
          </div>
          <Progress value={data.percent} aria-label="Avance del PreCheck" />
        </div>
      )}
      <div className="rounded-lg border bg-card p-5">
        <PipelineList current={current} ruleIndex={data.ruleIndex} ruleTotal={data.ruleTotal} />
      </div>
    </div>
  );
}
