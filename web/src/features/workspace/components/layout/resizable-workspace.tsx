"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DetailsPane, PlanPane, RulesPane, type WorkspaceData } from "./panels";

/** Escritorio: tres paneles redimensionables (25 / 50 / 25 %). */
export function ResizableWorkspace({ items, selected, precheckId, agrupadas, expediente }: WorkspaceData) {
  return (
    <ResizablePanelGroup orientation="horizontal" id="precheck-workspace" className="min-h-0 flex-1">
      <ResizablePanel id="rules" defaultSize="25" minSize="18" maxSize="40">
        <RulesPane items={items} agrupadas={agrupadas} precheckId={precheckId} />
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Cambiar ancho de la lista de reglas" />
      <ResizablePanel id="plan" defaultSize="50" minSize="30">
        <PlanPane selected={selected} expediente={expediente} />
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Cambiar ancho del detalle" />
      <ResizablePanel id="details" defaultSize="25" minSize="18" maxSize="40">
        <DetailsPane selected={selected} precheckId={precheckId} expediente={expediente} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
