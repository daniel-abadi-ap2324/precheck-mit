"use client";

import { useRef, type KeyboardEvent } from "react";
import type { CategoryGroup as Group } from "../../lib/filter-results";
import { stepSelection } from "../../lib/filter-results";
import { useWorkspaceStore } from "@/stores/workspace";
import type { DecisionRevision, RuleCategory } from "@/types";
import { CategoryGroup } from "./category-group";

interface RuleListProps {
  groups: Group[];
  visibleIds: string[];
  collapsed: RuleCategory[];
  onActivate: (id: string) => void;
  revision?: Record<string, DecisionRevision>;
}

/** Lista agrupada. Flechas arriba/abajo, Inicio y Fin mueven la selección entre las filas visibles. */
export function RuleList({ groups, visibleIds, collapsed, onActivate, revision }: RuleListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedId = useWorkspaceStore((s) => s.selectedRuleId);
  const toggleCategory = useWorkspaceStore((s) => s.toggleCategory);
  const tabbableId = selectedId && visibleIds.includes(selectedId) ? selectedId : (visibleIds[0] ?? null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target instanceof HTMLElement) || e.target.getAttribute("role") !== "option") return;
    const next =
      e.key === "ArrowDown" ? stepSelection(visibleIds, selectedId, 1)
      : e.key === "ArrowUp" ? stepSelection(visibleIds, selectedId, -1)
      : e.key === "Home" ? (visibleIds[0] ?? null)
      : e.key === "End" ? (visibleIds.at(-1) ?? null)
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    if (!next) return;
    // Mover con flechas no cambia de panel en móvil ni abre el drawer: solo selecciona.
    useWorkspaceStore.setState({ selectedRuleId: next });
    const el = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-rule-id]") ?? []).find((n) => n.dataset.ruleId === next);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div ref={ref} onKeyDown={onKeyDown} className="flex flex-col">
      {groups.map((g) => (
        <CategoryGroup
          key={g.category}
          group={g}
          open={!collapsed.includes(g.category)}
          onToggle={() => toggleCategory(g.category)}
          selectedId={selectedId}
          tabbableId={tabbableId}
          onActivate={onActivate}
          revision={revision}
        />
      ))}
    </div>
  );
}
