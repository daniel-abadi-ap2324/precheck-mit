"use client";

import { useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RuleDetails } from "../details/rule-details";
import { PlanPane, RulesPane, type WorkspaceData } from "./panels";

/** Tableta: reglas + plano; el detalle se abre en un drawer al elegir una regla. */
export function TabletWorkspace({ items, selected, precheckId, agrupadas, expediente }: WorkspaceData) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(var(--spacing-map-sm),38%)_1fr]">
      <div className="min-h-0 border-r">
        <RulesPane items={items} agrupadas={agrupadas} precheckId={precheckId} onRuleActivated={() => setOpen(true)} />
      </div>
      <div className="relative min-h-0">
        <PlanPane selected={selected} expediente={expediente} />
        {selected ? (
          <Button size="sm" variant="outline" className="absolute right-3 bottom-3 bg-card shadow-sm" onClick={() => setOpen(true)}>
            <PanelRightOpen aria-hidden />
            Ver detalle
          </Button>
        ) : null}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-panel-lg max-w-[90vw] gap-0 overflow-y-auto p-0 sm:max-w-panel-lg">
          <SheetHeader className="flex-row items-center justify-between border-b px-4 py-3">
            <SheetTitle>Detalle de la regla</SheetTitle>
            <SheetClose render={<Button variant="ghost" size="sm" />}>Cerrar</SheetClose>
          </SheetHeader>
          <RuleDetails item={selected} precheckId={precheckId} soloLectura={Boolean(expediente)} expediente={expediente} hideHeading />
        </SheetContent>
      </Sheet>
    </div>
  );
}
