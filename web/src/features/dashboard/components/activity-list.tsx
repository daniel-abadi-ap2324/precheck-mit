"use client";

import Link from "next/link";
import { useNotifications } from "@/hooks/use-api";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common";
import { formatDate } from "@/lib/format";

/** Actividad reciente (notificaciones), de la más nueva a la más antigua. */
export function ActivityList() {
  const { data, isPending, isError, refetch } = useNotifications();
  const items = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-labelledby="actividad" className="rounded-lg border bg-card">
      <h2 id="actividad" className="border-b px-4 py-3 font-semibold">
        Actividad
      </h2>
      {isPending ? (
        <SkeletonRows rows={3} className="p-4" />
      ) : isError ? (
        <ErrorState variant="inline" message="No se pudo cargar la actividad." onRetry={() => void refetch()} className="flex justify-center px-4 py-6" />
      ) : items.length === 0 ? (
        <EmptyState title="Sin actividad reciente." className="m-4 p-6" />
      ) : (
        <ol className="relative flex flex-col px-4 py-2">
          {items.map((n) => {
            const body = (
              <>
                <span className="flex items-center gap-2 text-sm font-medium">
                  {n.title}
                  {!n.read ? <span className="rounded bg-brand-soft px-1 text-2xs font-medium text-brand">nuevo</span> : null}
                </span>
                <span className="block text-sm text-muted-foreground">{n.body}</span>
                <time dateTime={n.createdAt} className="tabular mt-0.5 block text-xs text-muted-foreground">
                  {formatDate(n.createdAt)}
                </time>
              </>
            );
            return (
              <li key={n.id} className="border-l py-2 pl-3">
                {n.href ? (
                  <Link href={n.href} className="block rounded-sm hover:text-brand focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
