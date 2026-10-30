"use client";

import { Layers, Loader2, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadedSheetsText } from "../lib/legend";

interface ZoningStatusProps {
  /** La vista está a zoom suficiente para cargar zonificación. */
  active: boolean;
  loaded: number;
  requested: number;
  isFetching: boolean;
  hasError: boolean;
  onRetry: () => void;
  className?: string;
}

/** Chip sobre el mapa: hojas de zonificación cargadas, o aviso para acercar el mapa. */
export function ZoningStatus({ active, loaded, requested, isFetching, hasError, onRetry, className }: ZoningStatusProps) {
  const base = "pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur";
  return (
    <div role="status" aria-live="polite" className={cn("pointer-events-none flex justify-center", className)}>
      {!active ? (
        <p className={base}>
          <ZoomIn aria-hidden className="size-3.5 text-muted-foreground" />
          Acerque el mapa para ver la zonificación
        </p>
      ) : hasError ? (
        <p className={cn(base, "border-warning/40 text-warning")}>
          No se pudo cargar parte de la zonificación.
          <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
            Reintentar
          </button>
        </p>
      ) : (
        <p className={base}>
          {isFetching ? <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" /> : <Layers aria-hidden className="size-3.5 text-muted-foreground" />}
          <span className="tabular">{loadedSheetsText(loaded)}</span>
          {!isFetching && requested === 0 ? <span className="text-muted-foreground">· zona aún sin vectorizar</span> : null}
        </p>
      )}
    </div>
  );
}
