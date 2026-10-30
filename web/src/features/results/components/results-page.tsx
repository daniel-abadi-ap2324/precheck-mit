"use client";

import { Suspense } from "react";
import { FileText, FlaskConical } from "lucide-react";
import { CalloutBlock, EmptyState, ErrorState, LinkButton, PreliminaryNotice, SkeletonRows } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceBadge, FueraDeCatalogoTag, UnofficialTag } from "@/components/status";
import { esAvisoDeZona, textoAvisoDeZona } from "@/lib/avisos-zona";
import { FUENTE_DICTAMEN } from "@/lib/dictamen";
import { useResultsData } from "../hooks/use-results-data";
import { useResultsQueryState } from "../hooks/use-results-query-state";
import { ComplianceGauge } from "./compliance-gauge";
import { ResultsExplorer } from "./results-explorer";
import { ResultsSummary } from "./results-summary";

function ResultsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando resultados">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-32" />
      <SkeletonRows rows={8} />
    </div>
  );
}

function ResultsContent({ projectId }: { projectId: string }) {
  const data = useResultsData(projectId);
  const { status, query, setStatus, setQuery } = useResultsQueryState();

  if (data.error) return <ErrorState error={data.error} onRetry={data.refetch} />;
  if (data.isLoading) return <ResultsLoading />;
  if (!data.hasPrecheck || data.total === 0) {
    return <EmptyState title="Este proyecto todavía no tiene resultados" body="Ejecute el PreCheck para ver el resumen y la tabla de resultados por regla." />;
  }
  const unofficial = data.unofficial;
  const dictamen = data.project?.expediente?.dictamen;
  const avisosZona = (data.project?.expediente?.avisos ?? []).filter(esAvisoDeZona);
  const verAgrupadas = data.agrupadas > 0 && (status === "ALL" || status === "MANUAL_REVIEW") && !query.trim();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Resultados del PreCheck</h2>
          <p className="text-sm text-muted-foreground">Resumen preliminar por regla. Seleccione una cifra para filtrar la tabla.</p>
        </div>
        <LinkButton href={`/projects/${projectId}/report`} variant="outline" size="sm">
          <FileText aria-hidden />
          Ver informe
        </LinkButton>
      </div>
      <PreliminaryNotice />
      {avisosZona.length ? (
        <CalloutBlock tone="warning" title="Revise la zonificación">
          <ul data-testid="aviso-zona" className="flex flex-col gap-1">
            {avisosZona.map((a, i) => (
              <li key={i}>{textoAvisoDeZona(a)}</li>
            ))}
          </ul>
          <p>Las reglas de la zona dependen de ese código: confírmelo con la certificación de uso de suelo (CEUS) y vuelva a ejecutar si lo corrige.</p>
        </CalloutBlock>
      ) : null}
      {dictamen ? (
        <p data-testid="fuente-dictamen" className="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm">
          Fuente de los estados: {FUENTE_DICTAMEN}. El arquitecto revisor decidió {dictamen.decididas} {dictamen.decididas === 1 ? "regla" : "reglas"}
          {dictamen.sinDecision ? `; ${dictamen.sinDecision} ${dictamen.sinDecision === 1 ? "queda" : "quedan"} con el estado del motor` : ""}. La conclusión y los supuestos están en el
          resumen del proyecto y en el informe.
        </p>
      ) : null}
      {unofficial > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm text-ink-muted">
          <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Resultados indicativos: {unofficial} de {data.total} reglas están en borrador y aún no las aprueba la DOYC. Cada resultado lleva la marca «no oficial».
          </span>
        </p>
      ) : null}
      {data.fueraDeCatalogo > 0 ? (
        <p data-testid="aviso-fuera-de-catalogo" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          <FueraDeCatalogoTag className="shrink-0" />
          <span>
            {data.fueraDeCatalogo} {data.fueraDeCatalogo === 1 ? "hallazgo lo propone" : "hallazgos los propone"} la IA sin que haya una regla del catálogo detrás: el motor no los evaluó y un revisor debe validarlos. Cada uno lleva la marca «Propuesto por la IA».
          </span>
        </p>
      ) : null}
      <ResultsSummary counts={data.counts} active={status} onSelect={setStatus} />
      <ComplianceGauge counts={data.counts} index={data.index} />
      <ResultsExplorer projectId={projectId} rows={data.rows} counts={data.counts} status={status} query={query} onStatusChange={setStatus} onQueryChange={setQuery} />
      {verAgrupadas ? (
        <p data-testid="linea-zona-por-confirmar" className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <ComplianceBadge status={data.lineaAgrupadas.status} official={false} size="sm" />
          <UnofficialTag />
          <span>{data.lineaAgrupadas.texto}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Pantalla /projects/[id]/results. */
export function ResultsPage({ projectId }: { projectId: string }) {
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <Suspense fallback={<ResultsLoading />}>
        <ResultsContent projectId={projectId} />
      </Suspense>
    </div>
  );
}
