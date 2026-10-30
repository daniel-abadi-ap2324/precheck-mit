"use client";

import { useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { LinkButton } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionStore } from "@/stores/session";
import type { DashboardMetrics } from "../lib/compute-dashboard-metrics";
import { greetingFor, pendingSummary } from "../lib/greeting";

const noop = () => () => {};
/** La sesión vive en sessionStorage: se lee solo tras hidratar para no desajustar el HTML del servidor. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

export function WelcomeSection({ metrics, loading }: { metrics: DashboardMetrics; loading: boolean }) {
  const hydrated = useHydrated();
  const name = useSessionStore((s) => s.session?.user.name);
  const greeting = hydrated ? `${greetingFor(new Date())}${name ? `, ${name}` : ""}` : "Panel";

  return (
    <section aria-labelledby="bienvenida" className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 id="bienvenida" className="text-xl font-semibold tracking-tight">
          {greeting}
        </h1>
        {loading ? <Skeleton className="mt-1.5 h-4 w-72" /> : <p className="mt-1 text-sm text-muted-foreground">{pendingSummary(metrics)}</p>}
      </div>
      <LinkButton href="/projects/new" size="lg">
        <Plus aria-hidden />
        Nuevo PreCheck
      </LinkButton>
    </section>
  );
}
