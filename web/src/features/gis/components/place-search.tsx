"use client";

import { useId } from "react";
import { Grid2x2, Landmark, MapPin, Search, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PLACE_KIND_LABEL, type PlaceResult } from "../lib/buscar-lugares";
import { usePlaceCombobox } from "../hooks/use-place-combobox";

const KIND_ICON = { lote: Square, corregimiento: Landmark, hoja: Grid2x2, direccion: MapPin } as const;

interface PlaceSearchProps {
  corregimientos: GeoJSON.FeatureCollection;
  sheets: GeoJSON.FeatureCollection;
  onSelect: (place: PlaceResult) => void;
}

/**
 * Búsqueda del mapa (combobox ARIA): lotes por ID, finca o dirección; corregimientos por nombre; hojas del
 * Documento Gráfico por código; y direcciones reales del distrito. Es la vía accesible para ubicarse sin usar el mapa.
 */
export function PlaceSearch({ corregimientos, sheets, onSelect }: PlaceSearchProps) {
  const id = useId();
  const listId = `${id}-list`;
  const cb = usePlaceCombobox("", onSelect, { corregimientos, sheets }, {
    abiertaAlInicio: false,
    activarPrimero: true,
    textoAlElegir: (place) => (place.kind === "lote" ? place.parcel.id : place.label),
  });
  const { results, enough, isFetching: fetching, addressError, activeIndex: active, total } = cb;
  const expanded = cb.expanded;

  const status = !enough
    ? "Escriba al menos 2 caracteres."
    : fetching
      ? `Buscando…${total ? ` ${total} resultado${total === 1 ? "" : "s"} por ahora.` : ""}`
      : `${total} resultado${total === 1 ? "" : "s"}.${addressError ? " La búsqueda de direcciones no respondió; se muestran lotes, corregimientos y hojas." : ""}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-input`}>Dirección, corregimiento, hoja o lote</Label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder="Ej.: Vía España, Betania, 10-3B, 083076"
          className="pl-8"
          value={cb.query}
          onChange={(e) => cb.setQuery(e.target.value)}
          onFocus={() => cb.setOpen(true)}
          onBlur={() => cb.setOpen(false)}
          onKeyDown={cb.onKeyDown}
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Resultados de búsqueda" hidden={!expanded || results.length === 0} className="flex max-h-80 flex-col overflow-y-auto rounded-md border bg-popover p-1">
        {results.map((r, i) => {
          const Icon = KIND_ICON[r.kind];
          return (
            <li
              key={r.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => cb.setActive(i)}
              onClick={() => cb.choose(r)}
              className={cn("flex cursor-pointer gap-2 rounded px-2 py-1.5 text-sm", i === active && "bg-muted")}
            >
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className={cn("block font-medium", (r.kind === "lote" || r.kind === "hoja") && "tabular")}>{r.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {PLACE_KIND_LABEL[r.kind]} · {r.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p role="status" className="text-xs text-muted-foreground">
        {status}
      </p>
      <p className="text-xs text-muted-foreground">Direcciones: OpenStreetMap (Photon), referenciales.</p>
    </div>
  );
}
