import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Project } from "@/types";
import { StatusBadge } from "@/components/status";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ComplianceMeter } from "./compliance-meter";

/** Tarjeta de proyecto para la vista en cuadrícula y el móvil. Todo el título es el enlace. */
export function ProjectCard({ project, className }: { project: Project; className?: string }) {
  return (
    <article className={cn("relative flex flex-col gap-3 rounded-lg border bg-card p-4 focus-within:ring-3 focus-within:ring-ring/50 hover:border-input", className)}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium leading-snug">
          <Link href={`/projects/${project.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
            {project.name}
          </Link>
        </h3>
        <StatusBadge status={project.status} size="sm" />
      </header>
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0">{project.address}</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Zonificación</dt>
        <dd className="font-medium">{project.zoningCode || "Por revisar"}</dd>
        <dt className="text-muted-foreground">Finca</dt>
        <dd className="tabular">{project.finca}</dd>
      </dl>
      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Índice preliminar</span>
          <ComplianceMeter value={project.complianceIndex} />
        </div>
        <p className="text-xs text-muted-foreground">
          Actualizado <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time>
        </p>
      </div>
    </article>
  );
}
