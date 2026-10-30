"use client";

import { useMemo } from "react";
import type { RuleResult } from "@/hooks/use-rule-results";
import { PlanViewer, sitePlanA101, type PlanSource, type PlanViewerTool } from "@/components/plan-viewer";
import { useWorkspaceStore } from "@/stores/workspace";

interface PlanPanelProps {
  item: RuleResult | null;
  source?: PlanSource;
}

/** Conecta el visor con el workspace: geometría de la regla seleccionada, capas y herramienta. */
export function PlanPanel({ item, source = sitePlanA101 }: PlanPanelProps) {
  const layers = useWorkspaceStore((s) => s.layers);
  const toggleLayer = useWorkspaceStore((s) => s.toggleLayer);
  const storeTool = useWorkspaceStore((s) => s.tool);
  const setTool = useWorkspaceStore((s) => s.setTool);
  const tool: PlanViewerTool = storeTool === "annotate" ? "select" : storeTool;
  const highlights = useMemo(() => (item?.result.geometry ?? []).filter((g) => g.sheetId === source.sheetId), [item, source.sheetId]);

  return (
    <section aria-label="Plano" className="flex h-full min-h-0 flex-col">
      <PlanViewer
        source={source}
        highlights={highlights}
        highlightKey={item?.rule.id ?? null}
        highlightTitle={item?.rule.title}
        layers={layers}
        onToggleLayer={toggleLayer}
        tool={tool}
        onToolChange={setTool}
      />
    </section>
  );
}
