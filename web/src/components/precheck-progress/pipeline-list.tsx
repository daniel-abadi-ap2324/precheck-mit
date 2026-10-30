import { CircleCheck, Circle, LoaderCircle } from "lucide-react";
import { PIPELINE } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import { stageState, type StageState } from "./use-precheck-progress";

const META: Record<StageState, { text: string; className: string }> = {
  done: { text: "Hecho", className: "text-pass" },
  current: { text: "En curso", className: "text-processing" },
  pending: { text: "Pendiente", className: "text-ink-muted" },
};

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") return <CircleCheck aria-hidden className="size-5 text-pass" />;
  if (state === "current") return <LoaderCircle aria-hidden className="size-5 animate-spin text-processing motion-reduce:animate-none" />;
  return <Circle aria-hidden className="size-5 text-input" />;
}

/** Etapas del análisis como estaciones de una poligonal: icono + texto en cada una. */
export function PipelineList({ current, ruleIndex, ruleTotal }: { current: number; ruleIndex: number; ruleTotal: number }) {
  return (
    <ol aria-label="Etapas del análisis" className="flex flex-col">
      {PIPELINE.map((p, i) => {
        const state = stageState(i, current);
        const meta = META[state];
        return (
          <li key={p.stage} aria-current={state === "current" ? "step" : undefined} className="relative flex gap-3 pb-4 last:pb-0">
            {i < PIPELINE.length - 1 ? (
              <span aria-hidden className={cn("absolute top-6 bottom-0 left-[9.5px] w-px", state === "done" ? "bg-pass/50" : "bg-line")} />
            ) : null}
            <span className="relative z-10 bg-card">
              <StageIcon state={state} />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
              <span className={cn("text-sm", state === "current" ? "font-semibold" : state === "pending" && "text-ink-muted")}>{p.label}</span>
              <span className={cn("text-xs font-medium", meta.className)}>
                {state === "current" && p.stage === "checks" && ruleTotal > 0 ? `${meta.text} · regla ${ruleIndex} de ${ruleTotal}` : meta.text}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
