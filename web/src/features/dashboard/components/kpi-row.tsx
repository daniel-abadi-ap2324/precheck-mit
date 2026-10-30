import { CircleHelp, CircleX, ClipboardList, FolderKanban, Gauge } from "lucide-react";
import { MetricCard } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardMetrics } from "../lib/compute-dashboard-metrics";
import { StatusBreakdown } from "./status-breakdown";
import { IndexScale } from "./index-scale";

const TILE = "rounded-none border-0 bg-card";

/**
 * Fila de indicadores como una sola banda con separadores finos (no cinco tarjetas sueltas).
 * Cada cifra lleva su contexto: de dónde sale y qué no significa.
 */
export function KpiRow({ metrics: m, prechecksLoading }: { metrics: DashboardMetrics; prechecksLoading: boolean }) {
  const pcLabel = m.precheckCount === 1 ? "PreCheck" : "PreChecks";
  return (
    <section aria-label="Indicadores del período" className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <div className="flex flex-col bg-card">
        <MetricCard className={TILE} label="Proyectos totales" value={m.total} icon={FolderKanban} />
        <StatusBreakdown byStatus={m.byStatus} className="px-4 pb-4" />
      </div>
      <MetricCard className={TILE} label="Revisiones cerradas" value={m.completed} icon={ClipboardList} tone="info" hint={`de ${m.total} proyectos`} />
      <MetricCard className={TILE} label="Pendientes de revisión DOYC" value={m.inReview} icon={CircleHelp} tone="manual" hint="esperan la revisión de personal de la DOYC" />
      <MetricCard
        className={TILE}
        label="Incumplimientos detectados"
        value={prechecksLoading ? "…" : m.failedRules}
        icon={CircleX}
        tone="fail"
        hint={m.precheckCount ? `reglas «No cumple» en ${m.precheckCount} ${pcLabel} del período con resultados, sin contar las pruebas de modelos` : "sin PreChecks con resultados en el período (no cuenta las pruebas de modelos)"}
      />
      <div className="flex flex-col bg-card">
        <MetricCard
          className={TILE}
          label="Índice preliminar promedio"
          value={m.averageIndex === null ? "—" : `${m.averageIndex} %`}
          icon={Gauge}
          tone="info"
          hint={`índice preliminar, no es aprobación · ${m.indexSample} ${m.indexSample === 1 ? "proyecto" : "proyectos"}`}
        />
        {m.averageIndex !== null ? <IndexScale value={m.averageIndex} className="px-4 pb-4" /> : null}
      </div>
    </section>
  );
}

export function KpiRowSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando indicadores" className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}
