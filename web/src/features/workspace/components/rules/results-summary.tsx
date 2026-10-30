"use client";

import type { StatusCounts } from "../../lib/filter-results";
import type { StatusFilter } from "@/stores/workspace";
import { complianceMeta, toneClasses } from "@/lib/status";
import { cn } from "@/lib/utils";

const ORDER: Exclude<StatusFilter, "ALL">[] = ["PASS", "FAIL", "WARNING", "MANUAL_REVIEW", "NOT_APPLICABLE"];

interface Props {
  counts: StatusCounts;
  active: StatusFilter;
  onFilter: (f: StatusFilter) => void;
}

/** Contadores por estado; cada uno filtra la lista (pulsar de nuevo quita el filtro). */
export function ResultsSummary({ counts, active, onFilter }: Props) {
  return (
    <div role="group" aria-label="Resumen por estado" className="grid grid-cols-2 gap-1.5">
      {ORDER.map((status) => {
        const meta = complianceMeta[status];
        const tone = toneClasses[meta.tone];
        const Icon = meta.icon;
        const pressed = active === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={pressed}
            onClick={() => onFilter(pressed ? "ALL" : status)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
              // «No aplica» ocupa la fila entera: así los cinco recuadros suman el total de reglas evaluadas.
              status === "NOT_APPLICABLE" && "col-span-2",
              pressed ? cn(tone.bg, tone.border) : "bg-card",
            )}
          >
            <Icon aria-hidden className={cn("size-3.5 shrink-0", tone.text)} />
            <span className="flex-1 truncate text-ink">{meta.label}</span>
            <span className={cn("tabular text-sm font-semibold", tone.text)}>{counts[status]}</span>
          </button>
        );
      })}
    </div>
  );
}
