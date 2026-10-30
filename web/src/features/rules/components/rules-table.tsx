"use client";

import { useMemo } from "react";
import { useTable } from "@tanstack/react-table";
import { SortableHeader, TablePagination } from "@/components/common/data-table";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { ComplianceRule } from "@/types";
import { buildRuleColumns, rulesTableFeatures } from "./rules-columns";

interface RulesTableProps {
  rules: ComplianceRule[];
  onView: (rule: ComplianceRule) => void;
}

/** Tabla de reglas con orden por columna y paginación (TanStack Table v9). */
export function RulesTable({ rules, onView }: RulesTableProps) {
  const columns = useMemo(() => buildRuleColumns(onView), [onView]);
  const table = useTable({
    features: rulesTableFeatures,
    columns,
    data: rules,
    initialState: { pagination: { pageIndex: 0, pageSize: 15 }, sorting: [] },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border bg-card">
        <Table>
          <caption className="sr-only">Biblioteca de reglas. Use los encabezados para ordenar.</caption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <SortableHeader
                    key={header.id}
                    sortable={header.column.getCanSort()}
                    direction={header.column.getIsSorted()}
                    onToggle={header.column.getToggleSortingHandler()}
                    className="whitespace-nowrap"
                  >
                    <table.FlexRender header={header} />
                  </SortableHeader>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="align-top whitespace-normal">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        label="Paginación de reglas"
        summary={({ total, pageIndex, pageCount }) => `${total} regla${total === 1 ? "" : "s"} · página ${pageCount === 0 ? 0 : pageIndex + 1} de ${pageCount}`}
        showPageIndicator={false}
        pageIndex={table.state.pagination.pageIndex}
        pageSize={table.state.pagination.pageSize}
        pageCount={table.getPageCount()}
        total={rules.length}
        canPrev={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
        onPrev={table.previousPage}
        onNext={table.nextPage}
      />
    </div>
  );
}
