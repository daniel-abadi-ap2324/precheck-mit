"use client";

import { ErrorState, SkeletonRows } from "@/components/common";
import { MarcadoresRecientes } from "@/features/marcadores/components/marcadores-recientes";
import { useDashboardData } from "../hooks/use-dashboard-data";
import { ActivityList } from "./activity-list";
import { KpiRow, KpiRowSkeleton } from "./kpi-row";
import { RecentProjects } from "./recent-projects";
import { ReviewQueue } from "./review-queue";
import { WelcomeSection } from "./welcome-section";

export function DashboardPage() {
  const { projects, metrics, isLoading, prechecksLoading, error, refetch } = useDashboardData();

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <WelcomeSection metrics={metrics} loading={isLoading} />
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiRow metrics={metrics} prechecksLoading={prechecksLoading} />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_var(--spacing-panel)]">
            <RecentProjects projects={projects} />
            <aside aria-label="Pendientes y actividad" className="flex flex-col gap-5">
              <MarcadoresRecientes />
              <ReviewQueue projects={projects} />
              <ActivityList />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      <KpiRowSkeleton />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_var(--spacing-panel)]">
        <SkeletonRows rows={6} className="rounded-lg border bg-card p-4" />
        <SkeletonRows rows={4} className="rounded-lg border bg-card p-4" />
      </div>
    </>
  );
}
