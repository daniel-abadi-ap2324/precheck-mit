"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import type { ProjectStatus } from "@/types";
import type { ProjectFilters } from "../lib/project-filters";
import { StatusFilter } from "./status-filter";
import { ViewToggle } from "./view-toggle";

interface ProjectsToolbarProps {
  filters: ProjectFilters;
  counts: Record<ProjectStatus, number> | undefined;
  total: number | undefined;
  onChange: (patch: Partial<ProjectFilters>) => void;
}

export function ProjectsToolbar({ filters, counts, total, onChange }: ProjectsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="search" className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="buscar-proyectos" className="sr-only">
            Buscar proyectos por nombre, dirección o finca
          </label>
          <InputGroup className="h-9 bg-card">
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id="buscar-proyectos"
              type="search"
              placeholder="Buscar por nombre, dirección o finca"
              value={filters.q}
              onChange={(e) => onChange({ q: e.target.value })}
              autoComplete="off"
            />
            {filters.q ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Borrar búsqueda" onClick={() => onChange({ q: "" })}>
                  <X aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>
        <ViewToggle value={filters.view} onChange={(view) => onChange({ view })} className="ml-auto hidden md:flex" />
      </div>
      <StatusFilter value={filters.status} counts={counts} total={total} onChange={(status) => onChange({ status })} />
    </div>
  );
}
