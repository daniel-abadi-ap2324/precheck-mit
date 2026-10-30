"use client";

import { useCallback, useMemo, useState } from "react";
import { useRules } from "@/hooks/use-api";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/common";
import type { ComplianceRule } from "@/types";
import { formatNumber } from "@/lib/format";
import { DEFAULT_RULE_FILTERS, filterRules, normaKey, normaOptions, zoningOptions, type RuleFilters } from "../lib/filter-rules";
import { RulesToolbar } from "./rules-toolbar";
import { RulesTable } from "./rules-table";
import { RuleDrawer } from "./rule-drawer";

/** Biblioteca de reglas: catálogo real del motor (reglas/*.json); las de demostración solo si no está disponible. */
export function RulesView({ initialZoning }: { initialZoning?: string }) {
  const rules = useRules();
  const [filters, setFilters] = useState<RuleFilters>({ ...DEFAULT_RULE_FILTERS, zoning: initialZoning ?? "all" });
  const [selected, setSelected] = useState<ComplianceRule | null>(null);
  const all = rules.data;
  const filtered = useMemo(() => (all ? filterRules(all, filters) : []), [all, filters]);
  const normas = useMemo(() => normaOptions(all ?? []), [all]);
  // Las zonas del filtro son las de la norma elegida (con todas, la lista mezcla códigos de normas distintas).
  const zonings = useMemo(() => zoningOptions((all ?? []).filter((r) => filters.norma === "all" || normaKey(r) === filters.norma)), [all, filters.norma]);
  const close = useCallback(() => setSelected(null), []);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <PageHeader
        title="Biblioteca de reglas"
        description="Reglas del motor con su norma, artículo y cita literal. Una regla no aprobada produce resultados «no oficial». Las reglas se versionan; no se editan en sitio."
      />
      <RulesToolbar filters={filters} zonings={zonings} normas={normas} onChange={setFilters} />
      {all ? (
        <p role="status" className="text-sm text-ink-muted">
          <span className="font-medium text-foreground">{formatNumber(all.length)} reglas</span> en el catálogo
          {filtered.length !== all.length ? ` · ${formatNumber(filtered.length)} con los filtros` : ""}
        </p>
      ) : null}
      {rules.isLoading ? <SkeletonRows rows={8} /> : null}
      {rules.error ? <ErrorState error={rules.error} onRetry={() => void rules.refetch()} /> : null}
      {all && filtered.length === 0 ? <EmptyState title="Ninguna regla coincide" body="Cambie la búsqueda o limpie los filtros." /> : null}
      {filtered.length > 0 ? <RulesTable rules={filtered} onView={setSelected} /> : null}
      <RuleDrawer rule={selected} onClose={close} />
    </div>
  );
}
