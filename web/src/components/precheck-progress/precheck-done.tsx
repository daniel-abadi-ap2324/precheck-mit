import type { ReactNode } from "react";
import { ClipboardList, ListChecks, Timer } from "lucide-react";
import { LinkButton } from "@/components/common";

/**
 * Panel final: el análisis terminó y los resultados esperan revisión humana. Tono informativo, no el verde de
 * «Cumple»: terminar el análisis no es cumplir (nunca un «cumple» global).
 */
export function PreCheckDone({ projectId, note }: { projectId: string; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-info/30 bg-info-soft p-5">
      <div className="flex items-start gap-3">
        <Timer aria-hidden className="mt-0.5 size-6 shrink-0 text-info" />
        <div>
          <h2 className="text-lg font-semibold">PreCheck terminado</h2>
          <p className="text-sm text-foreground">Los resultados están listos para revisión. Son preliminares hasta que los valide personal de la DOYC.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/projects/${projectId}/precheck`} size="lg">
          <ClipboardList aria-hidden />
          Revisar regla por regla
        </LinkButton>
        <LinkButton href={`/projects/${projectId}/results`} variant="outline" size="lg">
          <ListChecks aria-hidden />
          Ver resultados
        </LinkButton>
      </div>
      {note ? <div className="text-sm text-muted-foreground">{note}</div> : null}
    </div>
  );
}
