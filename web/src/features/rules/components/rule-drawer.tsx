"use client";

import { useState } from "react";
import { GitBranchPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ComplianceRule } from "@/types";
import { RuleDetail } from "./rule-detail";
import { RuleVersionForm } from "./rule-version-form";

interface RuleDrawerProps {
  rule: ComplianceRule | null;
  onClose: () => void;
}

/** Drawer de la regla: detalle y propuesta de nueva versión. */
export function RuleDrawer({ rule, onClose }: RuleDrawerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = rule !== null && editingId === rule.id;
  return (
    <Sheet
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) {
          setEditingId(null);
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {rule ? (
          <>
            <SheetHeader className="border-b pr-12">
              <SheetTitle>{editing ? "Proponer nueva versión" : rule.title}</SheetTitle>
              <SheetDescription className="tabular">
                {rule.id} · versión {rule.version}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              {editing ? (
                <RuleVersionForm rule={rule} onDone={() => setEditingId(null)} />
              ) : (
                <>
                  <RuleDetail rule={rule} />
                  <Button className="self-start" onClick={() => setEditingId(rule.id)}>
                    <GitBranchPlus aria-hidden />
                    Proponer nueva versión
                  </Button>
                </>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
