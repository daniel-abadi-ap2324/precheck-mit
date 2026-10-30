import { useId } from "react";
import { ClipboardCheck, Download } from "lucide-react";
import { LinkButton } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NO_DISPONIBLE = "Descarga no disponible en esta demostración";

export function PlanActions({ projectId, fileName }: { projectId: string; fileName: string }) {
  const hintId = useId();
  return (
    <div className="flex items-center justify-end gap-1">
      <LinkButton href={`/projects/${projectId}/precheck`} size="sm" variant="ghost" aria-label={`Ver lámina ${fileName} en la revisión`}>
        <ClipboardCheck aria-hidden />
        Ver en revisión
      </LinkButton>
      <Tooltip>
        {/* aria-disabled (no disabled): el botón sigue recibiendo foco y se anuncia como no disponible, con el motivo. */}
        <TooltipTrigger
          render={
            <Button size="sm" variant="ghost" aria-disabled="true" aria-describedby={hintId} className="opacity-50" onClick={(e) => e.preventDefault()} />
          }
        >
          <Download aria-hidden />
          <span className="sr-only">{`Descargar ${fileName}`}</span>
          <span aria-hidden>Descargar</span>
        </TooltipTrigger>
        <TooltipContent>{NO_DISPONIBLE}</TooltipContent>
      </Tooltip>
      <span id={hintId} hidden>
        {NO_DISPONIBLE}
      </span>
    </div>
  );
}
