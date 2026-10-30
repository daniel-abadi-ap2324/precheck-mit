import { Scale } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** Nota obligatoria en resultados e informes (principio 3, Acuerdo 110 Art. 3). */
export function PreliminaryNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div role="note" className={cn("flex items-start gap-2 rounded-md border border-info/30 bg-info-soft text-info", compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm", className)}>
      <Scale aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="text-foreground">{brand.preliminaryNotice}</p>
    </div>
  );
}
