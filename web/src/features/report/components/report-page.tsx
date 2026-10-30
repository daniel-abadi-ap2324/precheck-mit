"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LinkButton } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { AiRequirementNotice } from "@/features/ia/components/ai-requirement-notice";
import { useReportModel } from "../hooks/use-report-model";
import type { ReportVersion } from "../lib/report-model";
import { sectionsOf } from "../lib/sections";
import { ReportDocument } from "./report-document";
import { ReportPrintStyles } from "./print-styles";
import { ReportToc } from "./report-toc";
import { ReportToolbar } from "./report-toolbar";

function ReportLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando informe" className="mx-auto flex w-full max-w-[8.5in] flex-col gap-3 rounded-lg border bg-card p-12">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-16 w-full" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

/** Pantalla /projects/[id]/report: índice fijo + documento imprimible + acciones. */
export function ReportPage({ projectId }: { projectId: string }) {
  const [version, setVersion] = useState<ReportVersion>("revisor");
  const { model, hasPrecheck, isLoading, error, refetch } = useReportModel(projectId, version);

  let body;
  if (error) body = <ErrorState error={error} onRetry={refetch} />;
  else if (isLoading) body = <ReportLoading />;
  else if (!hasPrecheck || !model) {
    body = (
      <EmptyState
        title="Este proyecto todavía no tiene informe"
        body="El informe se genera a partir de una evaluación registrada del PreCheck."
        action={
          <LinkButton href={`/projects/${projectId}`} variant="outline" size="sm">
            Volver al proyecto
          </LinkButton>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ReportToolbar model={model} version={version} onVersionChange={setVersion} />
        <AiRequirementNotice que="El dictamen con IA de este informe" className="print:hidden" />
        {/* Columnas con mínimo 0: si no, el índice (una fila sin cortes en móvil) ensancha toda la página. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] print:block">
          <aside className="min-w-0 print:hidden">
            <ReportToc sections={sectionsOf(model)} />
          </aside>
          <ReportDocument model={model} />
        </div>
        <ReportPrintStyles />
      </div>
    );
  }
  return <div className="mx-auto w-full max-w-6xl p-4 md:p-6">{body}</div>;
}
