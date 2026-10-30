import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:flex-row">
      <Skeleton className="min-h-map-sm flex-1" />
      <Skeleton className="h-96 lg:w-panel-lg" />
    </div>
  );
}
