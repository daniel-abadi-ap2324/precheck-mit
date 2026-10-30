"use client";

import Link from "next/link";
import { FileStack } from "lucide-react";
import { usePlans } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common";
import { formatBytes } from "@/lib/format";

export function PlansSummary({ projectId }: { projectId: string }) {
  const { data, isPending, isError, refetch } = usePlans(projectId);
  const total = data?.reduce((acc, p) => acc + p.sizeBytes, 0) ?? 0;
  return (
    <section aria-labelledby="planos-resumen" className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <FileStack aria-hidden className="size-5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h2 id="planos-resumen" className="text-sm font-medium">
          Planos cargados
        </h2>
        {isPending ? (
          <Skeleton className="mt-1 h-4 w-32" />
        ) : isError ? (
          <ErrorState variant="inline" message="No se pudo cargar." onRetry={() => void refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="tabular font-semibold text-foreground">{data.length}</span> {data.length === 1 ? "archivo" : "archivos"}
            {data.length ? ` · ${formatBytes(total)}` : ""}
          </p>
        )}
      </div>
      <Link href={`/projects/${projectId}/plans`} className="text-sm text-brand underline-offset-4 hover:underline">
        Ver planos
      </Link>
    </section>
  );
}
