import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FactRow {
  label: string;
  /** Sin valor (null/undefined) se muestra una raya: nunca una celda vacía. */
  value: ReactNode;
  /** «muted»: dato ausente o secundario (color atenuado y cursiva); «strong»: dato principal. */
  tone?: "default" | "muted" | "strong";
}

/**
 * Ancho de la columna de etiquetas:
 * - `sm` (10rem) y `md` (14rem): páginas y fichas; en móvil la etiqueta queda sobre su valor.
 * - `fluid`: paneles estrechos (mapa, tarjetas); dos columnas proporcionales a cualquier ancho.
 */
export type FactLabelWidth = "sm" | "md" | "fluid";

const GRID: Record<FactLabelWidth, string> = {
  sm: "grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]",
  md: "grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]",
  fluid: "grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-3 gap-y-1.5",
};

const TONE: Record<NonNullable<FactRow["tone"]>, string | undefined> = {
  default: undefined,
  muted: "text-muted-foreground italic",
  strong: "font-medium",
};

interface FactListProps {
  rows: FactRow[];
  labelWidth?: FactLabelWidth;
  /** Nombre accesible de la lista, cuando hay varias en la misma vista. */
  label?: string;
  /** Cifras tabulares en todos los valores (códigos, áreas, coordenadas). */
  tabular?: boolean;
  /** `end`: valores numéricos cortos alineados a la derecha, junto a su etiqueta. */
  valueAlign?: "start" | "end";
  className?: string;
}

/** Lista de datos «etiqueta: valor» en dos columnas (`<dl>`), la forma común de fichas y paneles. */
export function FactList({ rows, labelWidth = "sm", label, tabular = false, valueAlign = "start", className }: FactListProps) {
  const end = valueAlign === "end";
  const stacked = !end && labelWidth !== "fluid";
  return (
    <dl aria-label={label} className={cn("grid text-sm", end ? "grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1" : GRID[labelWidth], className)}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className={cn("min-w-0 break-words", (tabular || end) && "tabular", end && "text-right", stacked && "max-sm:mb-1", TONE[r.tone ?? "default"])}>
            {r.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
