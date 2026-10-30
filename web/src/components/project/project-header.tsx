"use client";

import { etiquetaZona } from "@/lib/norma-zona";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, MapPin } from "lucide-react";
import { useProject } from "@/hooks/use-api";
import { ExpedienteTag, StatusBadge } from "@/components/status";
import { LinkButton } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { esProyectoWeb } from "@/services/proyectos/cliente";
import { RenameProject } from "./rename-project";
import { cn } from "@/lib/utils";

const TABS = [
  { seg: "", label: "Resumen" },
  { seg: "site", label: "Lote" },
  { seg: "plans", label: "Planos" },
  { seg: "precheck", label: "Revisión" },
  { seg: "results", label: "Resultados" },
  { seg: "report", label: "Informe" },
] as const;

export function ProjectHeader({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId);
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const current = pathname.slice(base.length).split("/")[1] ?? "";

  return (
    <div className="border-b bg-card px-4 pt-3 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {isLoading || !project ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{project.name}</h1>
              {esProyectoWeb(project.id) ? <RenameProject projectId={project.id} name={project.name} /> : null}
              <StatusBadge status={project.status} size="sm" />
            </div>
          )}
          {project ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {/* Un expediente real no trae dirección; si falta un dato, no se deja un rótulo vacío. */}
              {project.address || project.corregimiento ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="size-3.5" />
                  {project.address || project.corregimiento}
                </span>
              ) : null}
              {project.finca ? <span>Finca {project.finca}</span> : null}
              {project.origen === "expediente" ? <ExpedienteTag /> : null}
              <span>{etiquetaZona(project.zoningCode)}</span>
            </p>
          ) : null}
        </div>
        {/* No se repite el acceso estando ya en la revisión; el icono no sugiere «ejecutar». */}
        {project && project.status !== "PROCESSING" && current !== "precheck" ? (
          <LinkButton href={`${base}/precheck`} size="sm" variant="outline">
            <ClipboardCheck aria-hidden />
            Revisar regla por regla
          </LinkButton>
        ) : null}
      </div>
      <nav aria-label="Secciones del proyecto" className="-mb-px mt-3 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = current === t.seg;
          return (
            <Link
              key={t.seg}
              href={t.seg ? `${base}/${t.seg}` : base}
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 px-3 pb-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                active ? "border-brand font-medium text-foreground" : "border-transparent",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
