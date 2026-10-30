"use client";

import Link from "next/link";
import { useProperty } from "@/hooks/use-api";
import { PropertyCard } from "@/components/property";
import { ErrorState, SkeletonRows } from "@/components/common";

export function PropertySummary({ parcelId, projectId }: { parcelId: string | undefined; projectId: string }) {
  const { data, isPending, isError, refetch } = useProperty(parcelId);
  if (!parcelId) return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">El proyecto no tiene un lote asociado.</p>;
  if (isPending) return <SkeletonRows rows={5} className="rounded-lg border bg-card p-4" />;
  if (isError || !data)
    return <ErrorState variant="inline" message="No se pudo cargar la ficha del lote." onRetry={() => void refetch()} className="flex rounded-lg border bg-card p-4" />;
  return (
    <div className="flex flex-col gap-2">
      <PropertyCard property={data} showZoning={false} />
      <Link href={`/projects/${projectId}/site`} className="self-start text-sm text-brand underline-offset-4 hover:underline">
        Ver lote en el mapa y ficha de zona
      </Link>
    </div>
  );
}
