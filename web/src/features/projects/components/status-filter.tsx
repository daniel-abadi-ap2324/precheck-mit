"use client";

import type { ProjectStatus } from "@/types";
import { projectStatusMeta, toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import { PROJECT_STATUSES } from "../lib/project-filters";

interface StatusFilterProps {
  value: ProjectStatus | null;
  counts: Record<ProjectStatus, number> | undefined;
  total: number | undefined;
  onChange: (status: ProjectStatus | null) => void;
}

const chip =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-foreground";

/** Filtro por estado: un solo valor activo; cada opción con icono, texto y cifra. */
export function StatusFilter({ value, counts, total, onChange }: StatusFilterProps) {
  return (
    <div role="group" aria-label="Filtrar por estado" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={cn(chip, "bg-card")}>
        Todos
        {total !== undefined ? <span className="tabular text-muted-foreground">{total}</span> : null}
      </button>
      {PROJECT_STATUSES.map((s) => {
        const meta = projectStatusMeta[s];
        const Icon = meta.icon;
        return (
          <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(value === s ? null : s)} className={cn(chip, "bg-card")}>
            <Icon aria-hidden className={cn("size-3.5", toneClasses[meta.tone].text)} />
            {meta.label}
            {counts ? <span className="tabular text-muted-foreground">{counts[s]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
