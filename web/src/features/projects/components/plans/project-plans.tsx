"use client";

import { FileUp } from "lucide-react";
import { usePlans, useProject, useProperty } from "@/hooks/use-api";
import { PlanExamplePicker, PlanReading, UploadedPlanReading } from "@/features/plans";
import { EmptyState, ErrorState, LinkButton, SkeletonRows } from "@/components/common";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes } from "@/lib/format";
import { esIdDeExpediente } from "@/services/expedientes/cliente";
import { esProyectoWeb } from "@/services/proyectos/cliente";
import { RerunPreCheck } from "./rerun-precheck";
import { ExpedientePlans } from "../expediente/expediente-plans";
import { PlanActions } from "./plan-actions";
import { PlanStatus } from "./plan-status";
import { PlanRegions } from "./plan-regions";

/** /projects/[id]/plans — archivos cargados para el PreCheck; en un expediente real, su documento (solo lectura). */
export function ProjectPlans({ projectId }: { projectId: string }) {
  return esIdDeExpediente(projectId) ? <ExpedientePlans projectId={projectId} /> : <DemoPlans projectId={projectId} />;
}

function DemoPlans({ projectId }: { projectId: string }) {
  const { data, isPending, error, refetch } = usePlans(projectId);
  const project = useProject(projectId).data;
  const property = useProperty(project?.parcelId).data;
  const contexto = project ? { corregimiento: project.corregimiento, zona: project.zoningCode, areaM2: property?.parcel.areaM2 ?? null } : undefined;
  // Solo los PDF leídos en el servidor (con lectura, leyéndose o fallidos); los de demostración no tienen lectura.
  const leidos = (data ?? []).filter((p) => p.format === "PDF" && (p.extraction !== undefined || p.error));

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      <div>
        <h2 className="font-semibold">Planos cargados</h2>
        <p className="text-sm text-muted-foreground">Archivos que el PreCheck leyó para este proyecto (PDF, DWG, DXF o IFC).</p>
      </div>
      <PlanExamplePicker projectId={projectId} />
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <SkeletonRows rows={3} className="rounded-lg border bg-card p-4" />
      ) : data.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="Sin planos cargados"
          body="Los planos se cargan en el asistente de Nuevo PreCheck."
          action={
            <LinkButton href="/projects/new" size="sm">
              Ir a Nuevo PreCheck
            </LinkButton>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card p-2">
          <Table>
            <TableCaption className="sr-only">Planos del proyecto</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Archivo</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead className="text-right">Tamaño</TableHead>
                <TableHead className="text-right">Láminas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="max-w-72 truncate font-medium" title={plan.fileName}>
                    {plan.fileName}
                  </TableCell>
                  <TableCell>
                    <span className="rounded border bg-muted px-1.5 py-0.5 text-xs font-medium">{plan.format}</span>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatBytes(plan.sizeBytes)}</TableCell>
                  <TableCell className="tabular text-right">{plan.sheets.length || plan.extraction?.paginas.length || "—"}</TableCell>
                  <TableCell>
                    <PlanStatus status={plan.status} />
                  </TableCell>
                  <TableCell>
                    <PlanActions projectId={projectId} fileName={plan.fileName} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {leidos.map((plan) =>
        // En un proyecto de la web la lectura se puede corregir (el PreCheck usa lo corregido).
        esProyectoWeb(projectId) ? (
          <UploadedPlanReading key={plan.id} planId={plan.id} fileName={plan.fileName} contexto={contexto} />
        ) : (
          <section key={plan.id} aria-label={`Lectura de ${plan.fileName}`} className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="truncate font-semibold" title={plan.fileName}>
              {`Lectura de ${plan.fileName}`}
            </h2>
            <PlanReading plan={plan} contexto={contexto} />
          </section>
        ),
      )}
      {/* Paso 2 del flujo: regiones editables sobre la lámina (solo planos leídos de un proyecto de la web). */}
      {esProyectoWeb(projectId) ? leidos.filter((p) => p.status === "ready").map((plan) => <PlanRegions key={`regiones-${plan.id}`} planId={plan.id} fileName={plan.fileName} />) : null}
      {project && esProyectoWeb(projectId) && leidos.some((p) => p.status === "ready") ? (
        <RerunPreCheck project={project} lectura={leidos.find((p) => p.status === "ready" && p.extraction)?.extraction ?? null} />
      ) : null}
    </div>
  );
}
