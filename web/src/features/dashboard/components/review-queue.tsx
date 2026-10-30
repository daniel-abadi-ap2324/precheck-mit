import { etiquetaZona } from "@/lib/norma-zona";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Project } from "@/types";
import { ComplianceMeter } from "@/components/project-card";

/** «Mi cola»: proyectos cuyo PreCheck terminó y esperan revisión humana. */
export function ReviewQueue({ projects }: { projects: Project[] }) {
  const queue = projects.filter((p) => p.status === "REVIEW_REQUIRED");
  return (
    <section aria-labelledby="mi-cola" className="rounded-lg border bg-card">
      <header className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 id="mi-cola" className="font-semibold">
          Pendientes de revisión
        </h2>
        <span className="tabular text-sm text-muted-foreground">{queue.length} por revisar</span>
      </header>
      {queue.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay proyectos esperando revisión.</p>
      ) : (
        <ul>
          {queue.map((p) => (
            <li key={p.id} className="border-b last:border-0">
              <Link href={`/projects/${p.id}/precheck`} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {etiquetaZona(p.zoningCode)} · Finca {p.finca}
                  </p>
                  <ComplianceMeter value={p.complianceIndex} className="mt-1.5" />
                </div>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground group-hover:text-foreground" />
                <span className="sr-only">Revisar regla por regla</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
