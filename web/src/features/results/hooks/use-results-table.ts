"use client";

import { useMemo, useState } from "react";
import { useTable, type PaginationState, type SortingState } from "@tanstack/react-table";
import { buildResultColumns } from "../lib/columns";
import type { ResultRow } from "../lib/results-model";
import { resultsFeatures } from "../lib/table-setup";

/** Tabla de resultados: orden y paginación en cliente sobre las filas ya filtradas. */
export function useResultsTable(projectId: string, rows: ResultRow[]) {
  const columns = useMemo(() => buildResultColumns(projectId), [projectId]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  return useTable({
    features: resultsFeatures,
    columns,
    data: rows,
    getRowId: (row) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    enableSortingRemoval: true,
  });
}

export type ResultsTableInstance = ReturnType<typeof useResultsTable>;
