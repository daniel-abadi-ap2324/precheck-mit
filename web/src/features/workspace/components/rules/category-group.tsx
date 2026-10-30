"use client";

import { ChevronRight } from "lucide-react";
import type { CategoryGroup as Group } from "../../lib/filter-results";
import type { DecisionRevision } from "@/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { RuleCard } from "./rule-card";

interface CategoryGroupProps {
  group: Group;
  open: boolean;
  onToggle: () => void;
  selectedId: string | null;
  tabbableId: string | null;
  onActivate: (id: string) => void;
  revision?: Record<string, DecisionRevision>;
}

export function CategoryGroup({ group, open, onToggle, selectedId, tabbableId, onActivate, revision }: CategoryGroupProps) {
  const failing = group.items.filter((i) => i.result.status === "FAIL").length;
  const headingId = `cat-${group.category}`;
  return (
    <Collapsible open={open} onOpenChange={onToggle} className="border-b last:border-b-0">
      <h3 id={headingId} className="m-0">
        <CollapsibleTrigger className="flex w-full items-center gap-2 bg-card px-3 py-2 text-left text-compact font-medium text-ink hover:bg-muted">
          <ChevronRight aria-hidden className={cn("size-4 text-ink-muted transition-transform", open && "rotate-90")} />
          <span className="flex-1">{group.label}</span>
          {failing ? <span className="tabular text-xs text-fail">{failing} no cumple{failing > 1 ? "n" : ""}</span> : null}
          <span className="tabular min-w-6 rounded bg-muted px-1.5 text-center text-xs text-ink-muted">{group.items.length}</span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent>
        <div role="listbox" aria-labelledby={headingId} className="flex flex-col pb-1">
          {group.items.map((item) => (
            <RuleCard key={item.rule.id} item={item} selected={item.rule.id === selectedId} tabbable={item.rule.id === tabbableId} onActivate={onActivate} revision={revision?.[item.rule.id]?.accion} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
