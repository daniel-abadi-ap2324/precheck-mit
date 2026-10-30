"use client";

import Link from "next/link";
import { FileText, RefreshCw } from "lucide-react";
import type { Project } from "@/types";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "@/components/common";
import { ExpedienteTag, StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjects } from "@/hooks/use-api";
import { formatDate } from "@/lib/format";

/** /reports: un informe por proyecto con PreCheck registrado. */
export function ReportsList() {
  const { data, isLoading, error, refetch, isFetching } = useProjects();
  const withReport = (data?.items ?? []).filter((p) => p.precheckId);

  let body;
  if (error) body = <ErrorState error={error} onRetry={() => void refetch()} />;
  else if (isLoading) body = <SkeletonRows rows={4} />;
  else if (withReport.length === 0) {
    body = <EmptyState icon={FileText} title="Todavía no hay informes" body="Los informes aparecen cuando un proyecto tiene un PreCheck ejecutado." />;
  } else {
    body = (
      <Table aria-label="Informes" className="rounded-lg bg-card">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Proyecto</TableHead>
            <TableHead scope="col">Zona</TableHead>
            <TableHead scope="col">Estado</TableHead>
            <TableHead scope="col">Resultado</TableHead>
            <TableHead scope="col">Actualizado</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Acción</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withReport.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="whitespace-normal">
                <span className="font-medium">{p.name}</span>
                {p.origen === "expediente" ? (
                  <span className="mt-1 block">
                    <ExpedienteTag />
                  </span>
                ) : (
                  <span className="block text-xs text-ink-muted">{p.address}</span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                {p.zoningCode || "Por revisar"}
                {p.expediente?.normaAplicable ? <span className="block text-xs text-ink-muted">{p.expediente.normaAplicable}</span> : null}
              </TableCell>
              <TableCell>
                <StatusBadge status={p.status} size="sm" />
              </TableCell>
              <TableCell className="whitespace-normal">
                <Conteo project={p} />
              </TableCell>
              <TableCell className="tabular">{formatDate(p.updatedAt)}</TableCell>
              <TableCell>
                <Link href={`/projects/${p.id}/report`} className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline">
                  <FileText aria-hidden className="size-3.5" />
                  Abrir informe<span className="sr-only">: {p.name}</span>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Informes"
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw aria-hidden className={isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
            {isFetching ? "Actualizando…" : "Actualizar"}
          </Button>
        }
        description="Informes preliminares del PreCheck, uno por proyecto evaluado (de demostración o de expedientes reales revisados por el agente revisor-planos). Ninguno es un informe emitido ni sustituye el dictamen técnico de la DOYC (Acuerdo 110, Art. 3)."
      />
      {body}
    </div>
  );
}

/**
 * Conteo del expediente real: no cumplen, observaciones (con dictamen), a revisar en detalle, agrupadas por zona sin
 * confirmar y cumplen. Con dictamen, los estados son los del arquitecto revisor.
 */
function Conteo({ project }: { project: Project }) {
  const c = project.expediente?.conteo;
  if (!c) return <span className="text-ink-muted">—</span>;
  return (
    <span className="tabular text-sm">
      {project.expediente?.dictamen ? <span className="block text-xs text-ink-muted">Según el dictamen del arquitecto revisor</span> : null}
      <span className={c.noCumple ? "font-medium text-fail" : undefined}>{c.noCumple} no {c.noCumple === 1 ? "cumple" : "cumplen"}</span>
      {c.observaciones !== undefined ? (
        <>
          {" · "}
          <span className={c.observaciones ? "text-warning" : undefined}>
            {c.observaciones} {c.observaciones === 1 ? "observación" : "observaciones"}
          </span>
        </>
      ) : null}
      {" · "}
      <span>{c.revisar} a revisar</span>
      {c.agrupadas ? <span className="text-ink-muted"> (+{c.agrupadas} agrupadas por zona)</span> : null}
      {" · "}
      <span>{c.cumple} {c.cumple === 1 ? "cumple" : "cumplen"}</span>
    </span>
  );
}
