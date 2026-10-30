"use client";

import type { Project } from "@/types";
import { ProjectCard } from "@/components/project-card";
import { cn } from "@/lib/utils";
import type { ProjectsView } from "../lib/project-filters";
import { ProjectsTable } from "./projects-table";

const PAGE_SIZE = 10;

/** En móvil siempre tarjetas; en pantallas medianas, la vista elegida. */
export function ProjectsResults({ projects, view }: { projects: Project[]; view: ProjectsView }) {
  const grid = (
    <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", view === "table" && "md:hidden")}>
      {projects.map((p) => (
        <li key={p.id} className="flex">
          <ProjectCard project={p} className="flex-1" />
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {view === "table" ? (
        <div className="hidden rounded-lg border bg-card p-2 md:block">
          <ProjectsTable projects={projects} caption="Proyectos" sortable pageSize={PAGE_SIZE} initialSorting={[{ id: "updatedAt", desc: true }]} />
        </div>
      ) : null}
      {grid}
    </>
  );
}
