"use client";

import { WIZARD_STEPS, useWizardStore, type WizardStep } from "@/stores/wizard";
import { STEP_LABELS, isStepComplete, isStepReachable, stepIndex, type WizardSnapshot } from "../lib/steps";

export interface StepView {
  id: WizardStep;
  number: number;
  label: string;
  current: boolean;
  complete: boolean;
  reachable: boolean;
}

/** Navegación del asistente: paso actual, pasos completos y a cuáles se puede saltar. */
export function useWizardFlow() {
  const step = useWizardStore((s) => s.step);
  const files = useWizardStore((s) => s.files);
  const setStep = useWizardStore((s) => s.setStep);
  const snapshot: WizardSnapshot = { step, files };
  const index = stepIndex(step);

  const steps: StepView[] = WIZARD_STEPS.map((id, i) => ({
    id,
    number: i + 1,
    label: STEP_LABELS[id],
    current: id === step,
    complete: id !== step && isStepComplete(id, snapshot),
    reachable: isStepReachable(id, snapshot),
  }));

  return {
    step,
    index,
    steps,
    total: WIZARD_STEPS.length,
    canComplete: (id: WizardStep) => isStepComplete(id, snapshot),
    goTo: (id: WizardStep) => {
      if (isStepReachable(id, snapshot)) setStep(id);
    },
    next: () => setStep(WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]),
    back: () => setStep(WIZARD_STEPS[Math.max(index - 1, 0)]),
  };
}
