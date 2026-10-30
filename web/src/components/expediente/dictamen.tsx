import Link from "next/link";
import type { ReactNode } from "react";
import { Gavel } from "lucide-react";
import type { ComplianceResult, DictamenInfo } from "@/types";
import { ComplianceBadge } from "@/components/status";
import { enlacePaginaPlanos, FUENTE_DICTAMEN, textoObjecion, textoReservasDictamen, textoRevisionIa, textoSupuesto } from "@/lib/dictamen";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Conclusión y supuestos del dictamen del arquitecto revisor (resumen del expediente). Es preliminar: el estado del
 * expediente sigue «Pendiente de revisión DOYC» y el visto bueno final es de una persona.
 */
export function ConclusionDictamen({ dictamen, className, accion }: { dictamen: DictamenInfo; className?: string; accion?: ReactNode }) {
  return (
    <section
      id="conclusion"
      aria-labelledby="dictamen-titulo"
      className={cn("flex scroll-mt-20 flex-col gap-2 rounded-md border border-info/30 bg-info-soft p-3 text-sm", className)}
    >
      <h3 id="dictamen-titulo" className="flex items-center gap-1.5 font-semibold">
        <Gavel aria-hidden className="size-4 text-info" />
        Conclusión del arquitecto revisor
      </h3>
      {/* «Guardar» la conclusión entera (marcadores); el informe no lo pasa, así no sale impreso. */}
      {accion}
      {dictamen.conclusion ? <p data-testid="conclusion-dictamen">{dictamen.conclusion}</p> : <p className="text-ink-muted">El dictamen no trae conclusión.</p>}
      {dictamen.supuestos.length ? (
        <div>
          <h4 className="font-medium">Supuestos</h4>
          <ul className="mt-1 list-disc pl-5" aria-label="Supuestos del dictamen">
            {dictamen.supuestos.map((s) => (
              <li key={s.hecho}>{textoSupuesto(s)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Las reglas vigentes van en «Qué se supuso en esta revisión» (ADR-0016), con o sin dictamen. */}
      {dictamen.objeciones?.length ? (
        <div data-testid="objeciones">
          <h4 className="font-medium">Objeciones de la IA al motor</h4>
          <p className="text-xs text-ink-muted">No cambian el resultado: prevalece el motor. El equipo las revisa.</p>
          <ul className="mt-1 list-disc pl-5" aria-label="Objeciones">
            {dictamen.objeciones.map((o, i) => (
              <li key={`${o.reglaId}-${i}`}>{textoObjecion(o)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {dictamen.regionesDiscrepantes?.length ? (
        <div>
          <h4 className="font-medium">Regiones del plano que no coinciden con lo declarado</h4>
          <ul className="mt-1 list-disc pl-5" aria-label="Discrepancias de regiones">
            {dictamen.regionesDiscrepantes.map((r, i) => (
              <li key={`${r.referencia}-${i}`}>
                <span className="tabular text-ink-muted">{r.referencia}</span>: {r.detalle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-ink-muted">
        Fuente: {FUENTE_DICTAMEN}
        {dictamen.fecha ? `, ${formatDay(dictamen.fecha)}` : ""}. {textoRevisionIa(dictamen) ? `${textoRevisionIa(dictamen)} ` : ""}Resultado preliminar y no oficial: no sustituye el dictamen técnico de la DOYC (Acuerdo 110, Art. 3).
        {textoReservasDictamen(dictamen) ? ` ${textoReservasDictamen(dictamen)}` : ""}
      </p>
    </section>
  );
}

interface DecisionProps {
  result: Pick<ComplianceResult, "dictamen" | "motorStatus" | "motorReason">;
  /** Para enlazar cada página de la evidencia con la pestaña Planos (si la página tiene miniatura). */
  projectId?: string;
  paginas?: number[];
}

/** Valor leído, límite, justificación, evidencia, «Qué subsanar» y el resultado del motor de una regla decidida. */
export function DecisionDictamenDetalle({ result, projectId, paginas = [] }: DecisionProps) {
  const d = result.dictamen;
  if (!d) return null;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {d.origen === "motor" ? (
        <p role="note" data-testid="respaldo-motor" className="rounded-md border border-dashed border-supuesto/40 bg-supuesto-soft px-2.5 py-2 text-ink">
          <span className="font-medium">Decisión de respaldo del motor. </span>
          La IA no decidió esta regla
          {d.supuestos?.length ? `; descansa en ${d.supuestos.length === 1 ? "el supuesto" : "los supuestos"} ${d.supuestos.join(", ")} (ver «Qué se supuso en esta revisión»)` : ""}. Vale hasta
          que la IA o el revisor la decidan.
        </p>
      ) : null}
      {d.reserva ? (
        <p role="note" data-testid="reserva-dictamen" className="rounded-md border border-info/40 bg-info-soft px-2.5 py-2 text-ink">
          <span className="font-medium">{d.reserva.motivo === "motor" ? "Prevalece el motor de reglas. " : "No bloquea por confianza baja. "}</span>
          {d.reserva.detalle}
        </p>
      ) : null}
      {d.estado === "INFORMACION_REQUERIDA" ? (
        <p role="note" data-testid="informacion-requerida" className="rounded-md border border-warning/40 bg-warning-soft px-2.5 py-2 text-ink">
          <span className="font-medium">Información requerida. </span>
          La decisión depende de un documento o dato que no está en el expediente; no es una falla del plano. Lo que hay que aportar está en «Qué subsanar».
        </p>
      ) : null}
      {d.valorLeido || d.limite ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {d.valorLeido ? (
            <>
              <dt className="text-ink-muted">Valor leído</dt>
              <dd>{d.valorLeido}</dd>
            </>
          ) : null}
          {d.limite ? (
            <>
              <dt className="text-ink-muted">Límite</dt>
              <dd>{d.limite}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <div>
        <h5 className="font-medium">{d.origen === "motor" ? "Motivo" : "Justificación"}</h5>
        <p>{d.justificacion}</p>
      </div>
      {d.evidencia.length ? (
        <div>
          <h5 className="font-medium">Evidencia</h5>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {d.evidencia.map((e, i) => (
              <li key={i}>
                {e.pagina !== null && projectId && paginas.includes(e.pagina) ? (
                  <Link href={enlacePaginaPlanos(projectId, e.pagina)} className="text-brand underline-offset-4 hover:underline">
                    p. {e.pagina}
                    <span className="sr-only"> (ver la página en Planos)</span>
                  </Link>
                ) : e.pagina !== null ? (
                  <span>p. {e.pagina}</span>
                ) : null}
                {e.pagina !== null && e.detalle ? ": " : ""}
                {e.detalle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.subsanar ? (
        <div className="rounded-md border border-warning/30 bg-warning-soft p-2.5" data-testid="que-subsanar">
          <h5 className="font-medium">Qué subsanar</h5>
          <p>{d.subsanar}</p>
        </div>
      ) : null}
      {result.motorStatus ? (
        <div className="rounded-md border border-dashed p-2.5 text-xs text-ink-muted">
          <p className="flex flex-wrap items-center gap-1.5">
            <span>{d.origen === "motor" ? "Antes del respaldo:" : "Resultado del motor:"}</span>
            <ComplianceBadge status={result.motorStatus} official={false} size="sm" />
          </p>
          {result.motorReason ? <p className="mt-1">{result.motorReason}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
