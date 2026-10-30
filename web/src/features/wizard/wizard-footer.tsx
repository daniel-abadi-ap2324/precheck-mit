"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WizardFooterProps {
  onBack?: () => void;
  onNext?: () => void;
  /** Envía el formulario con este id en lugar de llamar a onNext. */
  formId?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  pending?: boolean;
  /** Explica por qué no se puede continuar (se asocia al botón). */
  hint?: ReactNode;
}

export function WizardFooter({ onBack, onNext, formId, nextLabel = "Continuar", nextDisabled, pending, hint }: WizardFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      {onBack ? (
        <Button variant="outline" size="lg" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Atrás
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {hint ? (
          <p id="wizard-next-hint" className="text-sm text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {onNext || formId ? (
          <Button
            size="lg"
            type={formId ? "submit" : "button"}
            form={formId}
            onClick={formId ? undefined : onNext}
            disabled={nextDisabled}
            loading={pending}
            aria-describedby={hint ? "wizard-next-hint" : undefined}
          >
            {pending ? "Guardando…" : nextLabel}
            {pending ? null : <ArrowRight aria-hidden />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
