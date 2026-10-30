import type { ComponentProps, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

export type SortDirection = false | "asc" | "desc";

/** Valor de aria-sort para una columna ordenable. */
export const ariaSort = (d: SortDirection): "ascending" | "descending" | "none" => (d === "asc" ? "ascending" : d === "desc" ? "descending" : "none");

interface SortableHeaderProps extends Omit<ComponentProps<"th">, "children" | "aria-sort"> {
  direction: SortDirection;
  /** Alterna el orden (acepta el manejador de TanStack `getToggleSortingHandler()`). */
  onToggle: ((event: unknown) => void) | undefined;
  /** false: la columna no se ordena y se pinta como un <th> normal. */
  sortable?: boolean;
  children: ReactNode;
}

/**
 * Cabecera de columna ordenable: el <th> anuncia el estado con aria-sort y el contenido es un botón
 * que alterna el orden. El icono es decorativo (el estado ya está en aria-sort).
 */
export function SortableHeader({ direction, onToggle, sortable = true, children, ...props }: SortableHeaderProps) {
  if (!sortable) return <TableHead {...props}>{children}</TableHead>;
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead aria-sort={ariaSort(direction)} {...props}>
      <button
        type="button"
        onClick={onToggle}
        className="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {children}
        <Icon aria-hidden className={direction ? "size-3.5 text-foreground" : "size-3.5 text-muted-foreground"} />
      </button>
    </TableHead>
  );
}
