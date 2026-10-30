"use client";

import { Search } from "lucide-react";
import { FormField } from "@/components/common/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { categoryLabels } from "@/lib/status";
import type { RuleCategory, RuleState } from "@/types";
import { DEFAULT_RULE_FILTERS, type NormaOption, type RuleFilters } from "../lib/filter-rules";
import { RULE_STATES, ruleStateMeta } from "../lib/rule-meta";
import { NativeSelect } from "@/components/ui/native-select";

interface RulesToolbarProps {
  filters: RuleFilters;
  zonings: string[];
  normas: NormaOption[];
  onChange: (f: RuleFilters) => void;
}

/** Campo de filtro: etiqueta pequeña y apagada sobre el control. */
const FILTER_FIELD = { className: "min-w-36 gap-1", labelClassName: "text-xs font-normal text-muted-foreground" } as const;

/** Búsqueda y filtros de la biblioteca de reglas. */
export function RulesToolbar({ filters, zonings, normas, onChange }: RulesToolbarProps) {
  const set = <K extends keyof RuleFilters>(key: K, value: RuleFilters[K]) => onChange({ ...filters, [key]: value });
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_RULE_FILTERS);
  return (
    <div role="search" aria-label="Filtrar reglas" className="flex flex-wrap items-end gap-3">
      <FormField id="rules-q" label="Buscar" {...FILTER_FIELD}>
        <div className="relative w-64 max-w-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="rules-q" type="search" placeholder="ID, descripción o cita" className="bg-card pl-8" value={filters.q} onChange={(e) => set("q", e.target.value)} />
        </div>
      </FormField>
      <FormField id="rules-norma" label="Norma" {...FILTER_FIELD}>
        <NativeSelect id="rules-norma" value={filters.norma} onChange={(e) => onChange({ ...filters, norma: e.target.value, zoning: "all" })}>
          <option value="all">Todas ({normas.reduce((n, o) => n + o.count, 0)})</option>
          {normas.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.count})
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="rules-category" label="Categoría" {...FILTER_FIELD}>
        <NativeSelect id="rules-category" value={filters.category} onChange={(e) => set("category", e.target.value as RuleCategory | "all")}>
          <option value="all">Todas</option>
          {Object.entries(categoryLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="rules-zoning" label="Zonificación" {...FILTER_FIELD}>
        <NativeSelect id="rules-zoning" value={filters.zoning} onChange={(e) => set("zoning", e.target.value)}>
          <option value="all">Todas</option>
          <option value="general">General (sin zona)</option>
          {zonings.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="rules-state" label="Estado de la regla" {...FILTER_FIELD}>
        <NativeSelect id="rules-state" value={filters.state} onChange={(e) => set("state", e.target.value as RuleState | "all")}>
          <option value="all">Todos</option>
          {RULE_STATES.map((s) => (
            <option key={s} value={s}>
              {ruleStateMeta[s].label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="rules-origin" label="Catálogo" {...FILTER_FIELD}>
        <NativeSelect id="rules-origin" value={filters.origin} onChange={(e) => set("origin", e.target.value as RuleFilters["origin"])}>
          <option value="all">Todas</option>
          <option value="real">Real</option>
          <option value="demo">Demostración</option>
        </NativeSelect>
      </FormField>
      <Button variant="ghost" onClick={() => onChange(DEFAULT_RULE_FILTERS)} disabled={!dirty}>
        Limpiar
      </Button>
    </div>
  );
}
