import { Circle, CircleCheck, CircleDot, CircleX } from "lucide-react";
import type { PreCheck, Project } from "@/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildProjectTimeline, type TimelineState } from "../../lib/project-timeline";

const STATE: Record<TimelineState, { icon: typeof Circle; className: string; label: string }> = {
  done: { icon: CircleCheck, className: "text-pass", label: "Hecho" },
  current: { icon: CircleDot, className: "text-brand", label: "En curso" },
  pending: { icon: Circle, className: "text-muted-foreground", label: "Pendiente" },
  failed: { icon: CircleX, className: "text-fail", label: "Falló" },
};

export function ProjectTimeline({ project, precheck }: { project: Project; precheck: PreCheck | undefined }) {
  const events = buildProjectTimeline(project, precheck);
  return (
    <section aria-labelledby="historial" className="rounded-lg border bg-card p-4">
      <h2 id="historial" className="mb-3 font-semibold">
        Historial
      </h2>
      <ol className="flex flex-col">
        {events.map((e, i) => {
          const s = STATE[e.state];
          const Icon = s.icon;
          return (
            <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0" aria-current={e.state === "current" ? "step" : undefined}>
              {i < events.length - 1 ? <span aria-hidden className="absolute top-5 bottom-0 left-[9px] w-px bg-border" /> : null}
              <Icon aria-hidden className={cn("relative mt-0.5 size-[18px] shrink-0 bg-card", s.className)} />
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", e.state === "pending" && "text-muted-foreground")}>
                  {e.title}
                  <span className="sr-only"> ({s.label})</span>
                </p>
                {e.detail ? <p className="text-xs text-muted-foreground">{e.detail}</p> : null}
                {e.at ? (
                  <time dateTime={e.at} className="tabular text-xs text-muted-foreground">
                    {formatDate(e.at)}
                  </time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
