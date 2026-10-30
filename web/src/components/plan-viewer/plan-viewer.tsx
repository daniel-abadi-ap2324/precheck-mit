"use client";

import { useEffect, useRef } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Highlight, PlanLayerKey, PlanLayerVisibility, PlanSource, PlanViewerTool } from "./types";
import { boundsOf, padBounds } from "./geometry";
import { describeHighlights } from "./describe";
import { usePanZoom } from "./use-pan-zoom";
import { useElementSize } from "./use-element-size";
import { useFullscreen } from "./use-fullscreen";
import { useMeasure } from "./use-measure";
import { usePlanInteractions } from "./use-plan-interactions";
import { PlanToolbar } from "./plan-toolbar";
import { PlanCanvas } from "./plan-canvas";

export interface PlanViewerProps {
  source: PlanSource;
  /** Geometría a resaltar (ya filtrada a esta lámina). */
  highlights: Highlight[];
  /** Identidad del resaltado (p. ej. ID de la regla); al cambiar, el visor se ajusta a la geometría. */
  highlightKey: string | null;
  highlightTitle?: string;
  layers: PlanLayerVisibility;
  onToggleLayer: (k: PlanLayerKey) => void;
  tool: PlanViewerTool;
  onToolChange: (t: PlanViewerTool) => void;
  className?: string;
}

export function PlanViewer({ source, highlights, highlightKey, highlightTitle, layers, onToggleLayer, tool, onToolChange, className }: PlanViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { size, measured } = useElementSize(stageRef);
  const pz = usePanZoom({ width: source.widthM, height: source.heightM }, size);
  const fullscreen = useFullscreen(rootRef);
  const measure = useMeasure();
  const changeTool = (t: PlanViewerTool) => {
    if (t !== "measure") measure.clear();
    onToolChange(t);
  };
  const { cursor, handlers } = usePlanInteractions(stageRef, {
    ...pz,
    tool,
    onMeasurePoint: measure.addPoint,
    onHover: measure.setHover,
    onCancel: () => (tool === "measure" ? measure.clear() : changeTool("select")),
  });

  // Ajusta la vista a la geometría resaltada cuando cambia la regla o llega la primera medición real.
  const fitRef = useRef({ fitBounds: pz.fitBounds, fit: pz.fit, highlights });
  useEffect(() => {
    fitRef.current = { fitBounds: pz.fitBounds, fit: pz.fit, highlights };
  });
  useEffect(() => {
    const { fitBounds, fit, highlights: hs } = fitRef.current;
    const b = boundsOf(hs.flatMap((h) => h.points));
    if (b) fitBounds(padBounds(b, 3));
    else fit();
  }, [highlightKey, measured]);

  const noGeometry = highlightKey !== null && highlights.length === 0;
  const label = `Lámina ${source.name}. ${highlights.length ? `Resaltado${highlightTitle ? ` de «${highlightTitle}»` : ""}: ${describeHighlights(highlights)}.` : "Sin geometría resaltada."}`;

  return (
    <div ref={rootRef} className={cn("flex h-full min-h-0 flex-col bg-plan-paper", className)}>
      <PlanToolbar
        tool={tool}
        onToolChange={changeTool}
        zoom={pz.view.zoom}
        onZoomIn={() => pz.zoomAt(1.25)}
        onZoomOut={() => pz.zoomAt(0.8)}
        onFit={pz.fit}
        layers={layers}
        onToggleLayer={onToggleLayer}
        fullscreen={fullscreen}
        sheetName={source.name}
      />
      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-roledescription="visor de planos"
        aria-label={`Visor de la lámina ${source.name}. Teclas: más y menos para zoom, 0 para ajustar, flechas para desplazar.`}
        className="relative min-h-0 flex-1 overflow-hidden outline-offset-[-2px]"
        style={{ cursor }}
        {...handlers}
      >
        <PlanCanvas source={source} layers={layers} highlights={highlights} measure={measure} transform={pz} label={label} />
        {noGeometry ? (
          <p role="status" className="absolute top-3 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-ink shadow-sm">
            <Info aria-hidden className="size-4 shrink-0 text-info" />
            Esta regla no tiene geometría asociada en el plano
          </p>
        ) : null}
        <p aria-live="polite" className={cn("absolute bottom-3 left-3 rounded-md border bg-card px-2.5 py-1 text-xs text-dimension tabular", !measure.result && tool !== "measure" && "sr-only")}>
          {tool === "measure" ? (measure.result ? `Distancia medida: ${measure.result}` : "Medir: haga clic en dos puntos del plano") : ""}
        </p>
      </div>
    </div>
  );
}
