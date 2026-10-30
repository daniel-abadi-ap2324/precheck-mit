"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspaceStore, type MobilePane } from "@/stores/workspace";
import { DetailsPane, PlanPane, RulesPane, type WorkspaceData } from "./panels";

const PANES: { value: MobilePane; label: string }[] = [
  { value: "rules", label: "Reglas" },
  { value: "plan", label: "Plano" },
  { value: "details", label: "Detalle" },
];

/** Móvil: un panel a la vez, con control segmentado. Elegir una regla lleva al plano. */
export function MobileWorkspace({ items, selected, precheckId, agrupadas, expediente }: WorkspaceData) {
  const pane = useWorkspaceStore((s) => s.mobilePane);
  const setPane = useWorkspaceStore((s) => s.setMobilePane);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b bg-card p-2">
        <ToggleGroup
          aria-label="Panel visible"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          value={[pane]}
          onValueChange={(v: string[]) => {
            const next = PANES.find((p) => p.value === v[0]);
            if (next) setPane(next.value);
          }}
        >
          {PANES.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value} className="flex-1 aria-pressed:bg-brand-soft aria-pressed:text-brand">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1">
        {pane === "rules" ? <RulesPane items={items} agrupadas={agrupadas} precheckId={precheckId} /> : null}
        {pane === "plan" ? <PlanPane selected={selected} expediente={expediente} /> : null}
        {pane === "details" ? <DetailsPane selected={selected} precheckId={precheckId} expediente={expediente} /> : null}
      </div>
    </div>
  );
}
