"use client";

import { useId, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface PaginationInfo {
  /** Primera y última fila visibles (1-based; 0 si no hay filas). */
  from: number;
  to: number;
  total: number;
  pageIndex: number;
  pageCount: number;
}

interface TablePaginationProps {
  /** Nombre del <nav> (p. ej. «Paginación de proyectos»). */
  label: string;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Opciones de «Filas por página»; sin ellas no se ofrece el selector. */
  pageSizes?: readonly number[];
  onPageSizeChange?: (size: number) => void;
  /** Texto que se anuncia (aria-live) en lugar de «a–b de n». */
  summary?: (info: PaginationInfo) => ReactNode;
  /** Muestra «Página x de y» junto a los botones (por defecto sí). */
  showPageIndicator?: boolean;
  className?: string;
}

/**
 * Paginación de tabla: rango visible (anunciado con aria-live), filas por página opcional
 * (select nativo, ver `components/ui/native-select`), «Página x de y» y Anterior/Siguiente.
 */
export function TablePagination({
  label,
  pageIndex,
  pageSize,
  pageCount,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  pageSizes,
  onPageSizeChange,
  summary,
  showPageIndicator = true,
  className,
}: TablePaginationProps) {
  const sizeId = useId();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const info: PaginationInfo = { from, to, total, pageIndex, pageCount };

  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      <div className="flex items-center gap-2">
        {pageSizes?.length ? (
          <>
            <label htmlFor={sizeId} className="text-muted-foreground">
              Filas por página
            </label>
            <NativeSelect id={sizeId} value={pageSize} onChange={(e) => onPageSizeChange?.(Number(e.target.value))} className="w-auto">
              {pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </>
        ) : null}
        <p className="tabular text-muted-foreground" aria-live="polite">
          {summary ? summary(info) : `${from}–${to} de ${total}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {showPageIndicator ? (
          <span className="tabular text-muted-foreground">
            Página {pageIndex + 1} de {Math.max(1, pageCount)}
          </span>
        ) : null}
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!canPrev}>
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!canNext}>
          Siguiente
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
