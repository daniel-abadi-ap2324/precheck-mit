import { createColumnHelper, createPaginatedRowModel, createSortedRowModel, rowPaginationFeature, rowSortingFeature, sortFn_alphanumeric, sortFn_text, tableFeatures } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryLabels } from "@/lib/status";
import type { ComplianceRule } from "@/types";
import { catalogLabel, formatRuleValue, formatUnit, ruleOperatorText, ruleSource, ruleStateMeta, zoningLabel } from "../lib/rule-meta";
import { CatalogTag, RuleStateBadge } from "./rule-state-badge";

export const rulesTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

const helper = createColumnHelper<typeof rulesTableFeatures, ComplianceRule>();

/** Columnas de la biblioteca de reglas. `onView` abre el drawer de la regla. */
export function buildRuleColumns(onView: (rule: ComplianceRule) => void) {
  return helper.columns([
    helper.accessor("id", { header: "ID de regla", cell: (c) => <span className="tabular font-medium whitespace-nowrap">{c.getValue()}</span> }),
    helper.accessor((r) => ruleStateMeta[r.state].label, { id: "state", header: "Estado", sortFn: "text", cell: (c) => <RuleStateBadge state={c.row.original.state} /> }),
    helper.accessor((r) => categoryLabels[r.category], { id: "category", header: "Categoría", sortFn: "text" }),
    helper.accessor((r) => zoningLabel(r), { id: "zoning", header: "Zonificación", sortFn: "alphanumeric" }),
    helper.accessor("description", {
      header: "Descripción",
      enableSorting: false,
      cell: (c) => <span className="line-clamp-2 min-w-56">{c.getValue()}</span>,
    }),
    helper.accessor((r) => ruleOperatorText(r), { id: "operator", header: "Operador", enableSorting: false }),
    helper.accessor((r) => r.value ?? undefined, {
      id: "value",
      header: "Valor",
      sortUndefined: "last",
      cell: (c) => <span className="tabular">{formatRuleValue(c.getValue())}</span>,
    }),
    helper.accessor((r) => formatUnit(r.unit), { id: "unit", header: "Unidad", enableSorting: false }),
    helper.accessor((r) => ruleSource(r), {
      id: "source",
      header: "Fuente",
      sortFn: "text",
      cell: (c) => (
        <span className="whitespace-nowrap" title={c.row.original.regulation.norma}>
          {c.getValue()}
        </span>
      ),
    }),
    helper.accessor((r) => catalogLabel(r), { id: "catalog", header: "Catálogo", sortFn: "text", cell: (c) => <CatalogTag rule={c.row.original} /> }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: (c) => (
        <Button variant="outline" size="sm" onClick={() => onView(c.row.original)} aria-label={`Ver regla ${c.row.original.id}`}>
          <Eye aria-hidden />
          Ver
        </Button>
      ),
    }),
  ]);
}
