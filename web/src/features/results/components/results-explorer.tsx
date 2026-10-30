"use client";

import { useMemo } from "react";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/common";
import { TablePagination } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useResultsTable } from "../hooks/use-results-table";
import { filterRows, type ResultRow, type StatusCounts, type StatusFilter } from "../lib/results-model";
import { PAGE_SIZES } from "../lib/table-setup";
import { ResultsList } from "./results-list";
import { ResultsTable } from "./results-table";
import { ResultsToolbar } from "./results-toolbar";

interface Props {
  projectId: string;
  rows: ResultRow[];
  counts: StatusCounts;
  status: StatusFilter;
  query: string;
  onStatusChange: (s: StatusFilter) => void;
  onQueryChange: (q: string) => void;
}

/** Filtros + tabla (o lista apilada en móvil) + paginación. */
export function ResultsExplorer({ projectId, rows, counts, status, query, onStatusChange, onQueryChange }: Props) {
  const filtered = useMemo(() => filterRows(rows, status, query), [rows, status, query]);
  const table = useResultsTable(projectId, filtered);
  // Tabla desde tableta (md); debajo, lista.
  const showTable = useBreakpoint("md", true);

  return (
    <section aria-labelledby="tabla-titulo" className="flex flex-col gap-3">
      <h2 id="tabla-titulo" className="text-base font-semibold">
        Resultados por regla
      </h2>
      <ResultsToolbar status={status} query={query} counts={counts} onStatusChange={onStatusChange} onQueryChange={onQueryChange} />
      <p className="sr-only" aria-live="polite">
        {filtered.length} reglas coinciden con los filtros.
      </p>
      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ninguna regla coincide con los filtros"
          body="Cambie el estado seleccionado o la búsqueda para ver más resultados."
          action={
            <Button variant="outline" size="sm" onClick={() => onStatusChange("ALL")}>
              Ver todos los estados
            </Button>
          }
        />
      ) : (
        <>
          {showTable ? <ResultsTable table={table} /> : <ResultsList table={table} projectId={projectId} />}
          <TablePagination
            label="Paginación de resultados"
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(n) => table.setPageSize(n)}
            pageIndex={table.state.pagination.pageIndex}
            pageSize={table.state.pagination.pageSize}
            pageCount={table.getPageCount()}
            total={table.getRowCount()}
            canPrev={table.getCanPreviousPage()}
            canNext={table.getCanNextPage()}
            onPrev={() => table.previousPage()}
            onNext={() => table.nextPage()}
          />
        </>
      )}
    </section>
  );
}
