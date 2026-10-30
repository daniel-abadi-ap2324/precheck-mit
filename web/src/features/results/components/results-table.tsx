"use client";

import { SortableHeader } from "@/components/common/data-table";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { ResultsTableInstance } from "../hooks/use-results-table";

/** Vista de escritorio (≥ 768 px): tabla completa con encabezados ordenables. */
export function ResultsTable({ table }: { table: ResultsTableInstance }) {
  return (
    <Table aria-label="Resultados por regla" className="bg-card">
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => {
              return (
                <SortableHeader
                  key={header.id}
                  scope="col"
                  sortable={header.column.getCanSort()}
                  direction={header.column.getIsSorted()}
                  onToggle={() => header.column.toggleSorting()}
                  className="text-compact text-ink-muted"
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </SortableHeader>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} data-testid="result-row">
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className="align-top">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
