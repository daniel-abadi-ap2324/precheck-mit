import { SkeletonRows } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto con la forma del workspace (lista, lámina y detalle). */
export function WorkspaceSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(var(--spacing-map-sm),38%)_1fr] xl:grid-cols-[1fr_2fr_1fr]" aria-busy="true" aria-label="Cargando la revisión">
      <div className="flex flex-col gap-3 border-r bg-card p-3">
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
        <Skeleton className="h-8" />
        <SkeletonRows rows={8} />
      </div>
      <div className="hidden bg-plan-paper p-6 md:block">
        <Skeleton className="mx-auto aspect-[40/54] h-full max-h-[70dvh] bg-plan-grid/60" />
      </div>
      <div className="hidden flex-col gap-3 border-l bg-card p-4 xl:flex">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16" />
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}
