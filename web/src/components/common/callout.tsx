import type { ReactNode } from "react";
import { CircleCheck, CircleDashed, CircleHelp, CircleX, Info, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { toneClasses, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const ICONO: Record<Tone, LucideIcon> = {
  pass: CircleCheck,
  fail: CircleX,
  warning: TriangleAlert,
  info: Info,
  manual: CircleHelp,
  supuesto: CircleDashed,
  processing: LoaderCircle,
  neutral: Info,
};

interface CalloutProps {
  tone: Tone;
  /** Rótulo en negrita antes del texto («Requiere revisión»). */
  title?: string;
  children?: ReactNode;
  className?: string;
}

/** Nota en línea: icono + color del tono + texto (nunca solo color). Una sola forma para todas las pantallas. */
export function Callout({ tone, title, children, className }: CalloutProps) {
  const t = toneClasses[tone];
  const Icon = ICONO[tone];
  return (
    <p role="note" className={cn("flex gap-2 rounded-md border px-2.5 py-2 text-sm", t.border, t.bg, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.text)} />
      <span className="text-foreground">
        {title ? <span className={cn("font-medium", t.text)}>{title}. </span> : null}
        {children}
      </span>
    </p>
  );
}

/** Como `Callout`, pero un bloque: admite listas, botones y párrafos dentro (un `<p>` no puede contenerlos). */
export function CalloutBlock({ tone, title, children, className }: CalloutProps) {
  const t = toneClasses[tone];
  const Icon = ICONO[tone];
  return (
    <div role="note" className={cn("flex gap-2 rounded-md border px-2.5 py-2 text-sm", t.border, t.bg, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.text)} />
      <div className="flex min-w-0 flex-col gap-1.5 text-foreground">
        {title ? <p className={cn("font-medium", t.text)}>{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** «Requiere revisión»: el mismo tono e icono que el estado de regla REQUIERE_REVISION (lib/status.ts). */
export function ReviewCallout({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <Callout tone="manual" title="Requiere revisión" className={className}>
      {children}
    </Callout>
  );
}
