"use client";

import { ArrowRight, Plus } from "lucide-react";
import type { Project } from "@/types";
import { EmptyState, LinkButton } from "@/components/common";
import { ProjectCard } from "@/components/project-card";
import { ProjectsTable } from "@/features/projects/components/projects-table";

const RECENT = 6;

export function RecentProjects({ projects }: { projects: Project[] }) {
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT);
  return (
    <section aria-labelledby="recientes" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 id="recientes" className="font-semibold">
          Proyectos recientes
        </h2>
        <LinkButton href="/projects" variant="ghost" size="sm">
          Ver todos
          <ArrowRight aria-hidden />
        </LinkButton>
      </header>
      {recent.length === 0 ? (
        <EmptyState
          title="Aún no hay proyectos"
          body="Cree un PreCheck para evaluar un anteproyecto contra la normativa de su zona."
          action={
            <LinkButton href="/projects/new" size="sm">
              <Plus aria-hidden />
              Nuevo PreCheck
            </LinkButton>
          }
        />
      ) : (
        <>
          <ProjectsTable projects={recent} caption="Proyectos recientes" hiddenColumns={["address", "zoningCode", "updatedAt"]} className="hidden xl:flex" />
          <ul className="flex flex-col gap-3 xl:hidden">
            {recent.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
