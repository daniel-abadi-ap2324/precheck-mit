"use client";

import { useState, type KeyboardEvent } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePlaceResults } from "./use-place-results";
import type { PlaceResult } from "../lib/buscar-lugares";

/**
 * Lógica del combobox de lugares (patrón ARIA combobox + listbox), compartida por la búsqueda del mapa y la del
 * asistente: consulta con retardo, resultados de lotes, direcciones, corregimientos y hojas, opción activa
 * seguida por id, flechas/Inicio/Fin/Enter/Escape y apertura y cierre.
 */
export function usePlaceCombobox(
  initialQuery: string,
  onSelect: (place: PlaceResult) => void,
  layers: { corregimientos?: GeoJSON.FeatureCollection; sheets?: GeoJSON.FeatureCollection } = {},
  opciones: {
    /** Lista abierta al empezar (el asistente la muestra; el mapa la abre al enfocar). */
    abiertaAlInicio?: boolean;
    /** Sin opción activa elegida, la primera cuenta como activa (Enter elige enseguida). */
    activarPrimero?: boolean;
    /** Texto que queda en el campo al elegir (sin reabrir la lista). */
    textoAlElegir?: (place: PlaceResult) => string;
  } = {},
) {
  const { abiertaAlInicio = true, activarPrimero = false, textoAlElegir } = opciones;
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(abiertaAlInicio);
  // La opción activa se sigue por su id: si llegan resultados nuevos (las direcciones tardan más que los lotes),
  // Enter no elige otra cosa que la que se ve resaltada.
  const [activeId, setActiveId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = usePlaceResults(debounced, layers.corregimientos, layers.sheets);
  const results = open ? search.results : [];
  const elegida = activeId ? results.findIndex((r) => r.id === activeId) : -1;
  const activeIndex = elegida >= 0 ? elegida : activarPrimero && results.length ? 0 : -1;
  const setActive = (i: number) => setActiveId(results[i]?.id ?? null);

  const choose = (place: PlaceResult) => {
    setOpen(false);
    setActiveId(null);
    if (textoAlElegir) setQuery(textoAlElegir(place));
    onSelect(place);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open && results.length) e.stopPropagation();
      setOpen(false);
      setActiveId(null);
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      // Reabre la lista con la primera (o la última) opción activa.
      e.preventDefault();
      setOpen(true);
      const r = search.results;
      setActiveId((e.key === "ArrowDown" ? r[0] : r[r.length - 1])?.id ?? null);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(results.length - 1);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(results[activeIndex]);
    }
  };

  return {
    query,
    setQuery: (q: string) => {
      setQuery(q);
      setActiveId(null);
      setOpen(true);
    },
    results,
    expanded: results.length > 0,
    /** Resultados de la búsqueda aunque la lista esté cerrada (para el anuncio de estado). */
    total: search.results.length,
    /** Abre o cierra la lista (foco y pérdida de foco en la búsqueda del mapa). */
    setOpen,
    choose,
    debounced,
    enough: search.enough,
    activeIndex,
    setActive,
    onKeyDown,
    tooShort: !search.enough,
    isFetching: search.fetching,
    error: search.error,
    addressError: search.addressError,
  };
}
