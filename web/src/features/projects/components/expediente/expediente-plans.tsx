"use client";

import { useProject } from "@/hooks/use-api";
import { ErrorState, FactList, SkeletonRows, type FactRow } from "@/components/common";
import { EnlaceDocumento, MiniaturasExpediente } from "@/components/expediente";
import { formatDate } from "@/lib/format";

/** /projects/[id]/plans de un expediente real: el documento que revisó el agente (solo lectura). */
export function ExpedientePlans({ projectId }: { projectId: string }) {
  const { data: project, isPending, error, refetch } = useProject(projectId);
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} className="m-4 md:m-6" />;
  if (isPending) return <SkeletonRows rows={4} className="m-4 rounded-lg border bg-card p-4 md:m-6" />;
  const info = project.expediente;
  if (!info) return <ErrorState message="El expediente no trae los datos del documento revisado." className="m-4 md:m-6" />;

  const filas: FactRow[] = [
    { label: "Documento", value: info.documento ?? "no consta", tone: info.documento ? "default" : "muted" },
    { label: "Páginas", value: info.paginas ?? info.miniaturas?.length ?? "no consta" },
    { label: "Fecha de la corrida", value: <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time> },
  ];
  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      <div>
        <h2 className="font-semibold">Planos del expediente</h2>
        <p className="text-sm text-muted-foreground">
          Documento revisado por el agente revisor-planos. Es de solo lectura: el expediente no admite cargar otros planos desde aquí.
        </p>
      </div>
      <section aria-label="Documento revisado" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <FactList rows={filas} />
        <EnlaceDocumento projectId={projectId} info={info} className="self-start" />
      </section>
      <section aria-labelledby="paginas-titulo" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h2 id="paginas-titulo" className="font-semibold">
          Páginas
        </h2>
        <MiniaturasExpediente projectId={projectId} info={info} />
      </section>
    </div>
  );
}
