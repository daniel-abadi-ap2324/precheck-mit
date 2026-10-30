import { ArrowRight, CircleX, FilePen, LoaderCircle } from "lucide-react";
import type { Project } from "@/types";
import { LinkButton } from "@/components/common";
import { cn } from "@/lib/utils";

/** Aviso por estado con la siguiente acción. Solo para estados que piden algo al usuario. */
export function StatusCallout({ project }: { project: Project }) {
  const base = `/projects/${project.id}`;
  const config =
    project.status === "PROCESSING"
      ? { icon: LoaderCircle, tone: "border-processing/30 bg-processing-soft text-processing", title: "PreCheck en proceso", body: "Los planos se están leyendo y evaluando contra las reglas de la zona.", href: `${base}/processing`, cta: "Ver progreso" }
      : project.status === "FAILED"
        ? { icon: CircleX, tone: "border-fail/30 bg-fail-soft text-fail", title: "El PreCheck falló", body: "No se pudieron procesar los planos. Revise los archivos cargados.", href: `${base}/plans`, cta: "Ver planos" }
        : project.status === "DRAFT"
          ? { icon: FilePen, tone: "border-line bg-muted text-ink-muted", title: "Borrador", body: "Este proyecto aún no se ha enviado al PreCheck.", href: "/projects/new", cta: "Continuar en Nuevo PreCheck" }
          : null;
  if (!config) return null;
  const Icon = config.icon;
  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3", config.tone)}>
      <Icon aria-hidden className={cn("size-5 shrink-0", project.status === "PROCESSING" && "motion-safe:animate-spin")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{config.title}</p>
        <p className="text-sm text-foreground">{config.body}</p>
      </div>
      <LinkButton href={config.href} size="sm" variant="outline">
        {config.cta}
        <ArrowRight aria-hidden />
      </LinkButton>
    </div>
  );
}
