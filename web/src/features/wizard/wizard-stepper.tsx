"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "@/stores/wizard";
import type { StepView } from "./hooks/use-wizard-flow";

function Marker({ step }: { step: StepView }) {
  return (
    <span
      aria-hidden
      className={cn(
        "tabular flex size-7 shrink-0 items-center justify-center rounded-md border text-sm font-semibold",
        step.current && "border-brand bg-brand text-primary-foreground",
        step.complete && "border-brand bg-brand-soft text-brand",
        !step.current && !step.complete && "border-input bg-card text-ink-muted",
      )}
    >
      {step.complete ? <Check className="size-4" /> : step.number}
    </span>
  );
}

/** Secuencia numerada del asistente. Solo se puede saltar a pasos cuyos anteriores están completos. */
export function WizardStepper({ steps, onSelect }: { steps: StepView[]; onSelect: (id: WizardStep) => void }) {
  const current = steps.find((s) => s.current);
  return (
    <nav aria-label="Pasos del nuevo PreCheck">
      <p className="mb-2 text-sm text-muted-foreground md:hidden">
        Paso {current?.number} de {steps.length}: <span className="font-medium text-foreground">{current?.label}</span>
      </p>
      <ol className="flex items-center gap-1 md:gap-2">
        {steps.map((step, i) => {
          const status = step.complete ? " (completado)" : !step.reachable ? " (pendiente)" : "";
          const name = `Paso ${step.number}: ${step.label}${status}`;
          const content = (
            <>
              <Marker step={step} />
              <span aria-hidden className={cn("hidden text-sm md:inline", step.current ? "font-semibold" : "text-ink-muted")}>
                {step.label}
              </span>
              <span className="sr-only">{name}</span>
            </>
          );
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1 last:flex-none md:gap-2">
              {step.reachable && !step.current ? (
                <button type="button" onClick={() => onSelect(step.id)} className="flex items-center gap-2 rounded-md p-0.5 hover:bg-muted">
                  {content}
                </button>
              ) : (
                <span aria-current={step.current ? "step" : undefined} className="flex items-center gap-2 p-0.5">
                  {content}
                </span>
              )}
              {i < steps.length - 1 ? <span aria-hidden className={cn("h-px min-w-3 flex-1", step.complete ? "bg-brand" : "bg-line")} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
