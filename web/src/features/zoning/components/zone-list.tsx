"use client";

import type { Zoning } from "@/types";
import { zoningColors } from "@/config/zoning-colors";
import { cn } from "@/lib/utils";

interface ZoneListProps {
  zonings: Zoning[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

/** Lista de fichas de zona. Cada elemento es un botón con aria-pressed (sin trampas de foco). */
export function ZoneList({ zonings, selectedCode, onSelect }: ZoneListProps) {
  if (zonings.length === 0) return <p className="p-3 text-sm text-muted-foreground">Ninguna ficha coincide con la búsqueda.</p>;
  return (
    <ul aria-label="Fichas de zona" className="flex flex-col gap-0.5">
      {zonings.map((z) => {
        const selected = z.code === selectedCode;
        return (
          <li key={z.code}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(z.code)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                selected && "bg-brand-soft hover:bg-brand-soft",
              )}
            >
              <span aria-hidden className="mt-1 inline-block size-3 shrink-0 rounded-[2px] border border-ink/20" style={{ backgroundColor: zoningColors[z.code] ?? "transparent" }} />
              <span className="min-w-0">
                <span className="tabular block font-medium">{z.code}</span>
                <span className="block text-xs text-muted-foreground">{z.name}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
