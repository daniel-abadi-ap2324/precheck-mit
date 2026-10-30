"use client";

import Link from "next/link";
import { MapPinned } from "lucide-react";
import { formatSigned } from "@/lib/format";
import type { ResultsTableInstance } from "../hooks/use-results-table";
import { detectedText, MotorNote, planHref, ReferenceCell, requiredCellText, StatusCell } from "../lib/columns";

/** Vista móvil (< 768 px): cada regla como bloque apilado con los mismos datos que la tabla. */
export function ResultsList({ table, projectId }: { table: ResultsTableInstance; projectId: string }) {
  return (
    <ul aria-label="Resultados por regla" className="divide-y rounded-lg border bg-card">
      {table.getRowModel().rows.map(({ original: r }) => (
        <li key={r.id} data-testid="result-row" className="flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <StatusCell row={r} />
            <span className="text-xs text-muted-foreground">{r.categoryLabel}</span>
          </div>
          <div>
            <p className="font-medium">{r.title}</p>
            <p className="tabular text-xs text-ink-muted">{r.id}</p>
            <MotorNote row={r} />
          </div>
          <dl className="tabular grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Detectado</dt>
              <dd className="break-words">{detectedText(r)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Requerido</dt>
              <dd className="break-words">{requiredCellText(r)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Diferencia</dt>
              <dd>{formatSigned(r.difference, r.unit)}</dd>
            </div>
          </dl>
          <div className="text-sm">
            <ReferenceCell row={r} />
          </div>
          <Link href={planHref(projectId, r.id)} className="inline-flex min-h-6 items-center gap-1 text-sm text-brand underline-offset-4 hover:underline pointer-coarse:min-h-11">
            <MapPinned aria-hidden className="size-3.5" />
            Ver en el plano<span className="sr-only">: {r.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
