import { SkeletonRows } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-full max-w-sm" />
      <SkeletonRows rows={6} className="rounded-lg border bg-card p-4" />
    </div>
  );
}
