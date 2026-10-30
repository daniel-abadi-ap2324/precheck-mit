"use client";

import { useProject, usePreCheck } from "@/hooks/use-api";
import { ErrorState, SkeletonRows } from "@/components/common";
import { ExpedienteOverview } from "../expediente/expediente-overview";
import { PlansSummary } from "./plans-summary";
import { PreCheckSummaryPanel } from "./precheck-summary";
import { ProjectFacts } from "./project-facts";
import { ProjectTimeline } from "./project-timeline";
import { PropertySummary } from "./property-summary";
import { StatusCallout } from "./status-callout";
import { DeleteProject } from "./delete-project";
import { esProyectoWeb } from "@/services/proyectos/cliente";
import { ConclusionConMarcador } from "@/features/marcadores/components/conclusion-con-marcador";

/** /projects/[id] — Resumen del proyecto. */
export function ProjectOverview({ projectId }: { projectId: string }) {
  const { data: project, isPending, error, refetch } = useProject(projectId);
  const { data: precheck } = usePreCheck(project?.status !== "PROCESSING" ? project?.precheckId : undefined);

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-4 md:m-6" />;
  if (isPending) return <OverviewSkeleton />;
  if (project.origen === "expediente" && project.expediente) return <ExpedienteOverview project={project} info={project.expediente} precheck={precheck} />;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <StatusCallout project={project} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_var(--spacing-panel)]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Revisión con IA de un proyecto web: su conclusión, con «Guardar» (marcadores). */}
          {project.expediente?.dictamen ? <ConclusionConMarcador project={project} dictamen={project.expediente.dictamen} /> : null}
          <PreCheckSummaryPanel project={project} />
          <ProjectFacts project={project} />
        </div>
        <aside aria-label="Lote, planos e historial" className="flex flex-col gap-4">
          <PropertySummary parcelId={project.parcelId} projectId={project.id} />
          <PlansSummary projectId={project.id} />
          <ProjectTimeline project={project} precheck={precheck} />
          {esProyectoWeb(project.id) ? <DeleteProject projectId={project.id} name={project.name} /> : null}
        </aside>
      </div>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_var(--spacing-panel)]">
      <SkeletonRows rows={8} className="rounded-lg border bg-card p-4" />
      <SkeletonRows rows={6} className="rounded-lg border bg-card p-4" />
    </div>
  );
}
