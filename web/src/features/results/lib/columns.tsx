import Link from "next/link";
import { MapPinned } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { ComplianceBadge, FueraDeCatalogoTag, UnofficialTag } from "@/components/status";
import { formatMeasure, formatSigned } from "@/lib/format";
import { complianceMeta } from "@/lib/status";
import { compareOptionalNumbers, operatorSymbol, STATUS_ORDER, type ResultRow } from "./results-model";
import type { ResultsFeatures } from "./table-setup";

const helper = createColumnHelper<ResultsFeatures, ResultRow>();

export function formatRequired(row: Pick<ResultRow, "operator" | "required" | "unit">): string {
  // Regla de criterio: si el PreCheck calculó el valor exigido (p. ej. «lo establecido ó 5 m»), se muestra ese valor.
  if (row.operator === "criterio") return row.required === undefined ? "Criterio" : `${formatMeasure(row.required, row.unit)} (criterio)`;
  if (row.required === undefined) return "—";
  return `${operatorSymbol[row.operator]} ${formatMeasure(row.required, row.unit)}`;
}

/** Detectado: el valor medido; si no hay, el valor que leyó el arquitecto revisor (dictamen). */
export const detectedText = (row: Pick<ResultRow, "detected" | "unit" | "valorLeido">): string =>
  row.detected === undefined && row.valorLeido ? row.valorLeido : formatMeasure(row.detected, row.unit);

/** Requerido: el límite que escribió el arquitecto revisor (dictamen) o el de la regla. */
export const requiredCellText = (row: Pick<ResultRow, "operator" | "required" | "unit" | "limite">): string => row.limite ?? formatRequired(row);

/** Estado que había dado el motor, si el dictamen lo cambió. */
export function MotorNote({ row }: { row: Pick<ResultRow, "status" | "motorStatus"> }) {
  if (!row.motorStatus || row.motorStatus === row.status) return null;
  return <span className="block text-xs text-ink-muted">Motor: {complianceMeta[row.motorStatus].label}</span>;
}

export const planHref = (projectId: string, ruleId: string) => `/projects/${projectId}/precheck?rule=${encodeURIComponent(ruleId)}`;

export function StatusCell({ row }: { row: Pick<ResultRow, "status" | "official" | "fueraDeCatalogo" | "faltaEnPlano" | "conSupuesto"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ComplianceBadge status={row.status} official={row.official} faltaEnPlano={row.faltaEnPlano} conSupuesto={row.conSupuesto} size="sm" />
      {row.official ? null : <UnofficialTag />}
      {row.fueraDeCatalogo ? <FueraDeCatalogoTag /> : null}
    </span>
  );
}

export function ReferenceCell({ row }: { row: ResultRow }) {
  if (row.demo) return <span className="text-ink-muted">Regla de demostración, sin cita</span>;
  return (
    <span className="block max-w-56 whitespace-normal">
      <span className="font-medium">{row.article}</span>
      <span className="line-clamp-2 text-xs text-ink-muted" title={row.norma}>
        {row.norma}
        {row.sourcePage ? `, pág. ${row.sourcePage}` : ""}
      </span>
    </span>
  );
}

const byNumber = (key: "detected" | "required" | "difference") => ({
  sortFn: (a: { original: ResultRow }, b: { original: ResultRow }) => compareOptionalNumbers(a.original[key], b.original[key]),
  sortUndefined: "last" as const,
  sortDescFirst: false,
});

export function buildResultColumns(projectId: string) {
  return helper.columns([
    helper.accessor("status", {
      header: "Estado",
      sortFn: (a, b) => STATUS_ORDER[a.original.status] - STATUS_ORDER[b.original.status],
      cell: (info) => <StatusCell row={info.row.original} />,
    }),
    helper.accessor("categoryLabel", { header: "Categoría", sortFn: (a, b) => a.original.categoryLabel.localeCompare(b.original.categoryLabel, "es") }),
    helper.accessor("title", {
      header: "Regla",
      sortFn: (a, b) => a.original.title.localeCompare(b.original.title, "es"),
      cell: (info) => (
        <span className="block min-w-48 whitespace-normal">
          <span className="font-medium text-foreground">{info.row.original.title}</span>
          <span className="tabular block text-xs text-ink-muted">{info.row.original.id}</span>
          <MotorNote row={info.row.original} />
        </span>
      ),
    }),
    helper.accessor("detected", {
      header: "Detectado",
      ...byNumber("detected"),
      cell: (info) => <span className="tabular block max-w-48 whitespace-normal">{detectedText(info.row.original)}</span>,
    }),
    helper.accessor("required", {
      header: "Requerido",
      ...byNumber("required"),
      cell: (info) => <span className="tabular block max-w-48 whitespace-normal">{requiredCellText(info.row.original)}</span>,
    }),
    helper.accessor("difference", {
      header: "Diferencia",
      ...byNumber("difference"),
      cell: (info) => <span className="tabular">{formatSigned(info.row.original.difference, info.row.original.unit)}</span>,
    }),
    helper.accessor("article", { header: "Referencia", enableSorting: false, cell: (info) => <ReferenceCell row={info.row.original} /> }),
    helper.display({
      id: "action",
      header: "Acción",
      cell: (info) => (
        <Link
          href={planHref(projectId, info.row.original.id)}
          className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <MapPinned aria-hidden className="size-3.5" />
          Ver en el plano
          <span className="sr-only">: {info.row.original.title}</span>
        </Link>
      ),
    }),
  ]);
}
