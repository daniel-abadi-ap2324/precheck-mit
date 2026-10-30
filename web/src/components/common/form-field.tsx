import type { ReactNode } from "react";
import { CircleX } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  /** id del control; la ayuda y el error usan `${id}-hint` y `${id}-error`. */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
}

/**
 * Etiqueta + control + ayuda + error en línea. El control debe llevar
 * `aria-describedby={describedBy(id, { hint, error })}` (y `aria-invalid` si hay error).
 * El error va con icono además del color y el texto.
 */
export function FormField({ id, label, hint, error, className, labelClassName, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-fail">
          <CircleX aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Valor de aria-describedby: la ayuda y el error presentes (valor verdadero), o undefined. */
export const describedBy = (id: string, { hint, error }: { hint?: unknown; error?: unknown }): string | undefined =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
