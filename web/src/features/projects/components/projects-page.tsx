"use client";

import Link from "next/link";
import { GitCompareArrows, Plus, SearchX } from "lucide-react";
import { EmptyState, ErrorState, LinkButton, PageHeader, SkeletonRows } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-api";
import { countProjectsByStatus } from "@/lib/project-status-counts";
import { useProjectFilters } from "../hooks/use-project-filters";
import { useProjectsList } from "../hooks/use-projects-list";
import type { ProjectFilters } from "../lib/project-filters";
import { ProjectsResults } from "./projects-results";
import { ProjectsToolbar } from "./projects-toolbar";

function NewButton() {
  return (
    <>
      <LinkButton href="/projects/compare" variant="outline">
        <GitCompareArrows aria-hidden />
        Comparar modelos
      </LinkButton>
      <LinkButton href="/projects/new">
        <Plus aria-hidden />
        Nuevo PreCheck
      </LinkButton>
    </>
  );
}

export function ProjectsPage({ initialFilters }: { initialFilters: ProjectFilters }) {
  const { filters, applied, update, clear } = useProjectFilters(initialFilters);
  const list = useProjectsList({ q: applied.q || undefined, status: applied.status ?? undefined });
  const all = useProjects();
  const allItems = all.data?.items;
  const counts = allItems ? countProjectsByStatus(allItems) : undefined;
  const items = list.data?.items ?? [];
  const filtering = Boolean(applied.q || applied.status);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader title="Proyectos" description="Anteproyectos evaluados con PreCheck. Los resultados son preliminares y no constituyen aprobación." actions={<NewButton />} />
      <ProjectsToolbar filters={filters} counts={counts} total={allItems?.length} onChange={update} />
      {all.data?.ocultas ? (
        <p className="text-sm text-muted-foreground">
          Las corridas de prueba de modelos no salen aquí.{" "}
          <Link href="/rondas#corridas" className="text-brand hover:underline">
            Corridas de prueba ({all.data.ocultas}) →
          </Link>
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {list.isFetching ? "Buscando proyectos" : `${items.length} proyectos`}
      </p>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <SkeletonRows rows={6} className="rounded-lg border bg-card p-4" />
      ) : items.length === 0 ? (
        filtering ? (
          <EmptyState
            icon={SearchX}
            title="Ningún proyecto coincide"
            body="Pruebe con otro término o quite el filtro de estado."
            action={
              <Button variant="outline" size="sm" onClick={clear}>
                Quitar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState title="Aún no hay proyectos" body="Cree un PreCheck para evaluar un anteproyecto contra la normativa de su zona." action={<NewButton />} />
        )
      ) : (
        <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <ProjectsResults projects={items} view={filters.view} />
        </div>
      )}
    </div>
  );
}
