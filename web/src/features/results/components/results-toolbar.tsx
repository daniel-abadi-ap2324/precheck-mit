"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebouncedCallback } from "../hooks/use-debounced-callback";
import { parseStatusFilter, STATUS_FILTERS, type StatusCounts, type StatusFilter } from "../lib/results-model";

interface Props {
  status: StatusFilter;
  query: string;
  counts: StatusCounts;
  onStatusChange: (s: StatusFilter) => void;
  onQueryChange: (q: string) => void;
}

const countFor = (counts: StatusCounts, f: StatusFilter) => (f === "ALL" ? counts.total : counts[f]);

/** Filtro por estado (sincronizado con ?status=) y búsqueda con retardo (?q=). */
export function ResultsToolbar({ status, query, counts, onStatusChange, onQueryChange }: Props) {
  const [text, setText] = useState(query);
  const debounced = useDebouncedCallback(onQueryChange, 300);
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <ToggleGroup
        aria-label="Filtrar por estado"
        variant="outline"
        size="sm"
        spacing={0}
        value={[status]}
        onValueChange={(v) => onStatusChange(parseStatusFilter(v[0] ?? "ALL"))}
        className="max-w-full flex-wrap"
      >
        {STATUS_FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="aria-pressed:bg-brand-soft aria-pressed:text-brand">
            {f.label}
            <span className="tabular text-xs text-muted-foreground">{countFor(counts, f.value)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="relative w-full lg:w-72">
        <label htmlFor={searchId} className="sr-only">
          Buscar regla
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchId}
          type="search"
          value={text}
          placeholder="Buscar por regla, ID o norma"
          className="pl-8"
          onChange={(e) => {
            setText(e.target.value);
            debounced(e.target.value);
          }}
        />
      </div>
    </div>
  );
}
