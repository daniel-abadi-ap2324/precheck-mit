"use client";

import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectsView } from "../lib/project-filters";

const OPTIONS = [
  { value: "table", label: "Tabla", icon: Table2 },
  { value: "cards", label: "Tarjetas", icon: LayoutGrid },
] as const;

export function ViewToggle({ value, onChange, className }: { value: ProjectsView; onChange: (v: ProjectsView) => void; className?: string }) {
  return (
    <div role="group" aria-label="Vista" className={cn("inline-flex rounded-lg border bg-card p-0.5", className)}>
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
