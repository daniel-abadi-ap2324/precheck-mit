"use client";

import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspaceStore, type StatusFilter } from "@/stores/workspace";
import { complianceMeta } from "@/lib/status";

const OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Todas" },
  ...(["PASS", "FAIL", "WARNING", "MANUAL_REVIEW", "NOT_APPLICABLE"] as const).map((s) => ({ value: s, label: complianceMeta[s].label })),
];

export function RuleFilters() {
  const search = useWorkspaceStore((s) => s.search);
  const setSearch = useWorkspaceStore((s) => s.setSearch);
  const statusFilter = useWorkspaceStore((s) => s.statusFilter);
  const setStatusFilter = useWorkspaceStore((s) => s.setStatusFilter);
  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput type="search" placeholder="Buscar por título o ID" aria-label="Buscar regla por título o ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </InputGroup>
      <ToggleGroup
        aria-label="Filtrar por estado"
        size="sm"
        variant="outline"
        spacing={1}
        className="w-full flex-wrap"
        value={[statusFilter]}
        onValueChange={(v: string[]) => {
          const next = OPTIONS.find((o) => o.value === v[0]);
          if (next) setStatusFilter(next.value);
        }}
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="text-xs aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
