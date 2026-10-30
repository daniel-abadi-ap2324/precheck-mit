import { UserCheck, UserX, type LucideIcon } from "lucide-react";
import type { AccionRevision } from "@/types";
import { cn } from "@/lib/utils";

type Respondida = Exclude<AccionRevision, "pendiente">;

/** Cómo se ve la respuesta del revisor DOYC: icono + color + texto (nunca solo color). */
export const REVISION_META: Record<Respondida, { icon: LucideIcon; label: string; className: string }> = {
  confirmar: { icon: UserCheck, label: "Confirmada por el revisor", className: "border-pass/40 bg-pass-soft text-pass" },
  // Contradecir a la IA no es un «no cumple»: es un aviso de que la persona decidió distinto.
  contradecir: { icon: UserX, label: "Contradicha por el revisor", className: "border-warning/40 bg-warning-soft text-warning" },
};

/** Marca pequeña de la lista de reglas para las decisiones de la IA que el revisor ya confirmó o contradijo. */
export function RevisionMark({ accion, className }: { accion: AccionRevision | undefined; className?: string }) {
  if (!accion || accion === "pendiente") return null;
  const meta = REVISION_META[accion];
  const Icon = meta.icon;
  return (
    <span data-testid="marca-revision" className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium", meta.className, className)}>
      <Icon aria-hidden className="size-3" />
      {meta.label}
    </span>
  );
}
