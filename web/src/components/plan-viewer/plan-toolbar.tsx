"use client";

import { Columns2, Expand, Hand, Maximize, MessageSquareText, Minimize, MousePointer2, Ruler, ZoomIn, ZoomOut } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { PlanLayerKey, PlanLayerVisibility, PlanViewerTool } from "./types";
import { ToolButton } from "./tool-button";
import { LayersPopover } from "./layers-popover";

interface PlanToolbarProps {
  tool: PlanViewerTool;
  onToolChange: (t: PlanViewerTool) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  layers: PlanLayerVisibility;
  onToggleLayer: (k: PlanLayerKey) => void;
  fullscreen: { active: boolean; toggle: () => void };
  sheetName: string;
}

export function PlanToolbar({ tool, onToolChange, zoom, onZoomIn, onZoomOut, onFit, layers, onToggleLayer, fullscreen, sheetName }: PlanToolbarProps) {
  return (
    <div role="toolbar" aria-label="Herramientas del plano" className="flex flex-wrap items-center gap-0.5 border-b bg-card px-2 py-1">
      <ToolButton label="Seleccionar" icon={MousePointer2} pressed={tool === "select"} onClick={() => onToolChange("select")} />
      <ToolButton label="Mover" icon={Hand} pressed={tool === "pan"} onClick={() => onToolChange("pan")} hint="Mover (o mantenga Espacio y arrastre)" />
      <ToolButton label="Medir" icon={Ruler} pressed={tool === "measure"} onClick={() => onToolChange("measure")} hint="Medir: haga clic en dos puntos" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolButton label="Alejar" icon={ZoomOut} onClick={onZoomOut} shortcut="−" />
      <span className="tabular w-11 text-center text-xs text-ink-muted" aria-live="polite" aria-label={`Zoom ${Math.round(zoom * 100)} por ciento`}>
        {Math.round(zoom * 100)} %
      </span>
      <ToolButton label="Acercar" icon={ZoomIn} onClick={onZoomIn} shortcut="+" />
      <ToolButton label="Ajustar a la lámina" icon={Maximize} onClick={onFit} shortcut="0" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <LayersPopover layers={layers} onToggle={onToggleLayer} />
      <ToolButton label="Anotaciones" icon={MessageSquareText} pressed={layers.annotations} onClick={() => onToggleLayer("annotations")} hint="Mostrar u ocultar rótulos y anotaciones" />
      <ToolButton label="Comparar versiones" icon={Columns2} disabled hint="Disponible al cargar una segunda versión del plano" />
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden truncate text-xs text-ink-muted lg:inline">{sheetName}</span>
        <ToolButton
          label={fullscreen.active ? "Salir de pantalla completa" : "Pantalla completa"}
          icon={fullscreen.active ? Minimize : Expand}
          pressed={fullscreen.active}
          onClick={fullscreen.toggle}
        />
      </div>
    </div>
  );
}
