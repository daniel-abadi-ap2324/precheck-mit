"use client";

import { ClipboardCheck, FileText, ListChecks } from "lucide-react";
import type { ComplianceStatus, PreCheckSummary as Summary, Project } from "@/types";
import { usePreCheck } from "@/hooks/use-api";
import { ErrorState, LinkButton, PreliminaryNotice, SkeletonRows } from "@/components/common";
import { ComplianceIcon } from "@/components/status";
import { complianceMeta } from "@/lib/status";
import { formatDate } from "@/lib/format";

const COUNTS: { key: keyof Summary; status: ComplianceStatus }[] = [
  { key: "passed", status: "PASS" },
  { key: "failed", status: "FAIL" },
  { key: "warnings", status: "WARNING" },
  { key: "manualReview", status: "MANUAL_REVIEW" },
  { key: "notApplicable", status: "NOT_APPLICABLE" },
];

export function PreCheckSummaryPanel({ project }: { project: Project }) {
  const enabled = project.status !== "PROCESSING" ? project.precheckId : undefined;
  const { data, isPending, isError, refetch } = usePreCheck(enabled);
  const base = `/projects/${project.id}`;

  return (
    <section aria-labelledby="resumen-precheck" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="resumen-precheck" className="font-semibold">
          Resultados preliminares del PreCheck
        </h2>
        {data ? <p className="text-xs text-muted-foreground">Terminado {data.finishedAt ? formatDate(data.finishedAt) : "—"} · motor {data.engineVersion}</p> : null}
      </header>
      {!enabled ? (
        <p className="text-sm text-muted-foreground">{project.status === "PROCESSING" ? "El PreCheck se está ejecutando." : "Este proyecto aún no tiene resultados de PreCheck."}</p>
      ) : isPending ? (
        <SkeletonRows rows={2} />
      ) : isError || !data ? (
        <ErrorState variant="inline" message="No se pudo cargar el resultado del PreCheck." onRetry={() => void refetch()} />
      ) : (
        <>
          <p className="text-sm">
            <span className="tabular font-semibold">{data.summary.checked}</span> reglas evaluadas
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Resultados por estado">
            {COUNTS.map(({ key, status }) => (
              <li key={key} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ComplianceIcon status={status} className="size-3.5" />
                  {complianceMeta[status].label}
                </span>
                <span className="text-lg font-semibold">{data.summary[key]}</span>
                {key === "notApplicable" && data.summary.noAplican ? <span className="text-xs text-muted-foreground">+{data.summary.noAplican} reglas que no aplican a este plano (no evaluadas)</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`${base}/precheck`} size="sm">
              <ClipboardCheck aria-hidden />
              Revisión
            </LinkButton>
            <LinkButton href={`${base}/results`} size="sm" variant="outline">
              <ListChecks aria-hidden />
              Resultados
            </LinkButton>
            <LinkButton href={`${base}/report`} size="sm" variant="outline">
              <FileText aria-hidden />
              Informe
            </LinkButton>
          </div>
          <PreliminaryNotice compact />
        </>
      )}
    </section>
  );
}
