import { WIZARD_STEPS, type WizardFile, type WizardStep } from "@/stores/wizard";

export const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Cargar el plano",
  run: "Confirmar y ejecutar",
};

export interface WizardSnapshot {
  step: WizardStep;
  files: WizardFile[];
}

export const stepIndex = (step: WizardStep): number => WIZARD_STEPS.indexOf(step);

export const hasUploadedFiles = (files: WizardFile[]): boolean =>
  files.some((f) => f.status === "uploaded") && !files.some((f) => f.status === "uploading" || f.status === "queued");

/** Un paso está completo cuando sus datos son válidos. */
export function isStepComplete(step: WizardStep, s: WizardSnapshot): boolean {
  switch (step) {
    case "upload":
      // Un documento complementario solo no basta: hace falta el plano.
      return hasUploadedFiles(s.files) && s.files.some((f) => f.status === "uploaded" && !f.complementario);
    case "run":
      return false;
  }
}

/** Se puede saltar a un paso si todos los anteriores están completos. */
export function isStepReachable(step: WizardStep, s: WizardSnapshot): boolean {
  return WIZARD_STEPS.slice(0, stepIndex(step)).every((prev) => isStepComplete(prev, s));
}
