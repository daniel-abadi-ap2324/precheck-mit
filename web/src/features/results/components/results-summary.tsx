"use client";

import { ListChecks, type LucideIcon } from "lucide-react";
import { complianceMeta, toneClasses, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { StatusCounts, StatusFilter } from "../lib/results-model";

interface Tile {
  filter: StatusFilter;
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
}

function tilesFor(counts: StatusCounts): Tile[] {
  const tile = (s: "PASS" | "FAIL" | "WARNING" | "MANUAL_REVIEW"): Tile => ({
    filter: s,
    label: complianceMeta[s].label,
    value: counts[s],
    icon: complianceMeta[s].icon,
    tone: complianceMeta[s].tone,
  });
  return [
    { filter: "ALL", label: "Reglas evaluadas", value: counts.total, icon: ListChecks, tone: "info" },
    tile("PASS"),
    tile("FAIL"),
    tile("WARNING"),
    tile("MANUAL_REVIEW"),
  ];
}

interface Props {
  counts: StatusCounts;
  active: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
}

/** Conteo por estado. Cada cifra filtra la tabla (aria-pressed indica el filtro activo). */
export function ResultsSummary({ counts, active, onSelect }: Props) {
  return (
    <section aria-labelledby="resumen-titulo">
      <h2 id="resumen-titulo" className="sr-only">
        Resumen de resultados
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tilesFor(counts).map((t) => {
          const pressed = active === t.filter;
          const Icon = t.icon;
          return (
            <li key={t.filter} className={t.filter === "ALL" ? "col-span-2 sm:col-span-1" : undefined}>
              <button
                type="button"
                aria-pressed={pressed}
                onClick={() => onSelect(t.filter)}
                data-testid={`summary-${t.filter}`}
                className={cn(
                  "flex h-full w-full flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  pressed && "border-brand ring-1 ring-brand",
                )}
              >
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon aria-hidden className={cn("size-4", toneClasses[t.tone].text)} />
                  {t.label}
                </span>
                <span className="tabular text-2xl font-semibold tracking-tight text-foreground">{t.value}</span>
                <span className="text-xs text-muted-foreground">{pressed ? "Filtro activo" : "Filtrar la tabla"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
