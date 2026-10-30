"use client";

import type { DocumentoLeido } from "@/lib/documentos-complementarios";
import { useCorrectPlanData, usePlan } from "@/hooks/use-api";
import { ErrorState } from "@/components/common";
import { PlanReading, type ContextoExpediente } from "./plan-reading";

/** Lectura de un plano recién cargado: consulta el servidor hasta que termina de leerlo. */
export function UploadedPlanReading({ planId, fileName, contexto, complementos }: { planId: string; fileName: string; contexto?: ContextoExpediente; complementos?: DocumentoLeido[] }) {
  const { data, error, refetch } = usePlan(planId);
  const corregir = useCorrectPlanData(planId);
  return (
    <section aria-label={`Lectura de ${fileName}`} className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="truncate font-semibold" title={fileName}>
        {`Lectura de ${fileName}`}
      </h3>
      {error ? (
        <ErrorState variant="inline" error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <PlanReading plan={data} contexto={contexto} complementos={complementos} onCorregir={data.format === "PDF" && data.status === "ready" ? (c) => corregir.mutateAsync(c) : undefined} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Consultando el plano…
        </p>
      )}
    </section>
  );
}
