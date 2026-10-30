"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useZonings } from "@/hooks/use-api";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/common";
import { Input } from "@/components/ui/input";
import { filterZonings } from "../lib/zone-fields";
import { ZoneList } from "./zone-list";
import { ZoneSheet } from "./zone-sheet";
import { ZoningNotes } from "./zoning-notes";

/** Fichas de zonificación del Anexo 4 del PLOT: lista con búsqueda y ficha de detalle. */
export function ZoningView() {
  const zonings = useZonings();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => filterZonings(zonings.data ?? [], query), [zonings.data, query]);
  const current = zonings.data?.find((z) => z.code === selected) ?? list[0] ?? null;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <PageHeader title="Zonificación" description="Fichas normativas del suelo urbano (Anexo 4 del PLOT, Acuerdo 61 de 2021). La CEUS prevalece sobre el Documento Gráfico." />
      <ZoningNotes />
      {zonings.isLoading ? <SkeletonRows rows={6} /> : null}
      {zonings.error ? <ErrorState error={zonings.error} onRetry={() => void zonings.refetch()} /> : null}
      {zonings.data && zonings.data.length === 0 ? <EmptyState title="No hay fichas de zona cargadas" /> : null}
      {zonings.data && zonings.data.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[var(--spacing-map-sm)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-2">
            <label htmlFor="zone-search" className="sr-only">
              Buscar ficha por código o nombre
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="zone-search" type="search" placeholder="Código o nombre (RM-2, 1RM-2…)" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <ZoneList zonings={list} selectedCode={current?.code ?? null} onSelect={setSelected} />
          </div>
          {current ? <ZoneSheet zoning={current} /> : null}
        </div>
      ) : null}
    </div>
  );
}
