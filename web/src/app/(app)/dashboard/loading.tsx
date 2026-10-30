import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSkeleton } from "@/features/dashboard";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-4 w-64" />
      </div>
      <DashboardSkeleton />
    </div>
  );
}
