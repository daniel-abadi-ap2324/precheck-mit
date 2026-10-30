"use client";

import { useEffect, useRef } from "react";
import { SkeletonRows } from "@/components/common";
import type { WizardStep } from "@/stores/wizard";
import { useIsClient } from "@/hooks/use-is-client";
import { useWizardFlow } from "./hooks/use-wizard-flow";
import { STEP_LABELS } from "./lib/steps";
import { WizardStepper } from "./wizard-stepper";
import { StepUploadPlans } from "./steps/step-upload-plans";
import { StepRun } from "./steps/step-run";

function ActiveStep({ step, flow }: { step: WizardStep; flow: ReturnType<typeof useWizardFlow> }) {
  switch (step) {
    case "upload":
      return <StepUploadPlans onNext={flow.next} />;
    case "run":
      return <StepRun onBack={flow.back} />;
  }
}

function Wizard() {
  const flow = useWizardFlow();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previous = useRef(flow.step);

  // Al cambiar de paso, el foco va al título del paso (y el lector de pantalla lo anuncia).
  useEffect(() => {
    if (previous.current !== flow.step) headingRef.current?.focus();
    previous.current = flow.step;
  }, [flow.step]);

  return (
    <div className="flex flex-col gap-6">
      <WizardStepper steps={flow.steps} onSelect={flow.goTo} />
      <section aria-labelledby="wizard-step-title" className="flex flex-col gap-5 rounded-lg border bg-card p-5 md:p-6">
        <h2 id="wizard-step-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          <span className="tabular text-muted-foreground">
            {flow.index + 1}
            <span className="sr-only"> de {flow.total}</span>.
          </span>{" "}
          {STEP_LABELS[flow.step]}
        </h2>
        <ActiveStep step={flow.step} flow={flow} />
      </section>
    </div>
  );
}

/** Asistente «Nuevo PreCheck»: se sube el plano y se confirma lo que no se pudo comprobar. Vive en sessionStorage. */
export function NewPreCheckWizard() {
  const isClient = useIsClient();
  return isClient ? <Wizard /> : <SkeletonRows rows={8} />;
}
