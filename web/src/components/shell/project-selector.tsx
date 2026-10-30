"use client";

import { etiquetaZona } from "@/lib/norma-zona";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, FolderKanban } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { useProject, useProjects } from "@/hooks/use-api";
import { StatusBadge } from "@/components/status";
import { cn } from "@/lib/utils";

/** Cambia de proyecto conservando la sección actual (site, plans, precheck…). */
export function ProjectSelector() {
  const { data } = useProjects();
  const params = useParams<{ id?: string }>();
  // Una corrida de prueba abierta (desde /rondas o la comparación) no está en la lista: su nombre se lee aparte.
  const abierto = useProject(params.id ?? "");
  const pathname = usePathname();
  const router = useRouter();
  const current = data?.items.find((p) => p.id === params.id) ?? (params.id ? abierto.data : undefined);
  const section = params.id ? pathname.split("/")[3] : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-w-panel-sm gap-2")} aria-label="Cambiar de proyecto">
        <FolderKanban aria-hidden className="size-4 text-muted-foreground" />
        <span className="truncate">{current?.name ?? "Seleccionar proyecto"}</span>
        <ChevronsUpDown aria-hidden className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Proyectos recientes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data?.items.slice(0, 6).map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => router.push(`/projects/${p.id}${section ? `/${section}` : ""}`)} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{etiquetaZona(p.zoningCode)} · Finca {p.finca}</span>
            </span>
            <StatusBadge status={p.status} size="sm" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
