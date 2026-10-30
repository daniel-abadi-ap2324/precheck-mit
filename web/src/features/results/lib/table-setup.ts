import { createPaginatedRowModel, createSortedRowModel, rowPaginationFeature, rowSortingFeature, tableFeatures } from "@tanstack/react-table";

/** Funciones registradas de la tabla de resultados: orden y paginación en cliente. El filtro y la búsqueda van por URL (results-model). */
export const resultsFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

export type ResultsFeatures = typeof resultsFeatures;

export const PAGE_SIZES = [10, 25, 50] as const;
