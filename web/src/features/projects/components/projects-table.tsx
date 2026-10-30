"use client";

import { useTable, type SortingState } from "@tanstack/react-table";
import type { Project } from "@/types";
import { Table, TableBody, TableCaption, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { projectColumns } from "../lib/project-columns";
import { projectTableFeatures } from "../lib/table-features";
import { SortableHeader, TablePagination } from "@/components/common/data-table";

interface ProjectsTableProps {
  projects: Project[];
  caption: string;
  /** Activa el orden por columna (cabeceras como botones). */
  sortable?: boolean;
  /** Filas por página; sin valor no pagina. */
  pageSize?: number;
  initialSorting?: SortingState;
  /** Columnas que no se muestran (p. ej. en el panel, donde el ancho es menor). */
  hiddenColumns?: string[];
  className?: string;
}

/** id de una definición de columna (explícito o, en las de acceso por clave, la propia clave). */
const columnId = (c: (typeof projectColumns)[number]) => String(c.id ?? ("accessorKey" in c ? c.accessorKey : ""));

export function ProjectsTable({ projects, caption, sortable = false, pageSize, initialSorting = [], hiddenColumns = [], className }: ProjectsTableProps) {
  const table = useTable({
    features: projectTableFeatures,
    columns: hiddenColumns.length ? projectColumns.filter((c) => !hiddenColumns.includes(columnId(c))) : projectColumns,
    data: projects,
    enableSorting: sortable,
    initialState: { sorting: initialSorting, pagination: { pageIndex: 0, pageSize: pageSize ?? Math.max(projects.length, 1) } },
    getRowId: (row) => row.id,
  });

  return (
    <div className={cn("flex flex-col", className)}>
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                return (
                  <SortableHeader
                    key={header.id}
                    sortable={!header.isPlaceholder && sortable && header.column.getCanSort()}
                    direction={header.column.getIsSorted()}
                    onToggle={header.column.getToggleSortingHandler()}
                    className={cn("text-xs font-medium text-muted-foreground", header.column.columnDef.meta?.className)}
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
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn("py-2.5", cell.column.columnDef.meta?.className)}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pageSize ? (
        <TablePagination
          label="Paginación de proyectos"
          className="border-t px-2 pt-3"
          pageIndex={table.state.pagination.pageIndex}
          pageSize={table.state.pagination.pageSize}
          pageCount={table.getPageCount()}
          total={table.getRowCount()}
          canPrev={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onPrev={() => table.previousPage()}
          onNext={() => table.nextPage()}
        />
      ) : null}
    </div>
  );
}
