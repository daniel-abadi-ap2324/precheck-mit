import { complianceMeta } from "@/lib/status";
import type { StatusCounts } from "./results-model";

export interface GaugeSegment {
  status: "PASS" | "WARNING" | "MANUAL_REVIEW" | "FAIL";
  label: string;
  count: number;
  /** Porcentaje entero sobre las reglas evaluadas. */
  percent: number;
}

/** Orden de la barra: cumple primero, para que el índice se lea desde el origen. */
const ORDER = ["PASS", "WARNING", "MANUAL_REVIEW", "FAIL"] as const;

export function gaugeSegments(counts: StatusCounts): GaugeSegment[] {
  return ORDER.map((status) => ({
    status,
    label: complianceMeta[status].label,
    count: counts[status],
    percent: counts.total ? Math.round((counts[status] / counts.total) * 100) : 0,
  }));
}

/** Texto equivalente de la barra para lectores de pantalla. */
export function gaugeAriaLabel(counts: StatusCounts, index: number): string {
  const parts = gaugeSegments(counts).map((s) => `${s.count} ${s.label.toLowerCase()}`);
  return `Índice preliminar de cumplimiento ${index} %. Distribución de ${counts.total} reglas evaluadas: ${parts.join(", ")}.`;
}
