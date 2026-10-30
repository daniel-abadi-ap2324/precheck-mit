import type { ProjectStatus } from "@/types";
import { projectStatusMeta, toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";

const ORDER: ProjectStatus[] = ["REVIEW_REQUIRED", "PROCESSING", "COMPLETED", "DRAFT", "FAILED"];

/** Composición por estado: icono + cifra + etiqueta (nunca solo color). */
export function StatusBreakdown({ byStatus, className }: { byStatus: Record<ProjectStatus, number>; className?: string }) {
  const rows = ORDER.filter((s) => byStatus[s] > 0);
  if (!rows.length) return null;
  return (
    <ul className={cn("flex flex-col gap-0.5 text-xs", className)}>
      {rows.map((s) => {
        const meta = projectStatusMeta[s];
        const Icon = meta.icon;
        return (
          <li key={s} className="flex items-center gap-1.5 text-muted-foreground">
            <Icon aria-hidden className={cn("size-3.5", toneClasses[meta.tone].text)} />
            <span className="tabular w-4 text-right font-medium text-foreground">{byStatus[s]}</span>
            <span>{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
