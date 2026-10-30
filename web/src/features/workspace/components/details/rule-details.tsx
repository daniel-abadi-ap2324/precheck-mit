"use client";

import type { ReactNode } from "react";
import { MousePointerClick, Sparkles } from "lucide-react";
import type { RuleResult } from "@/hooks/use-rule-results";
import type { ExpedienteInfo } from "@/types";
import { EmptyState } from "@/components/common";
import { DecisionDictamenDetalle } from "@/components/expediente";
import { FUENTE_DICTAMEN, FUENTE_RESPALDO } from "@/lib/dictamen";
import { ComplianceBadge, FueraDeCatalogoTag, UnofficialTag } from "@/components/status";
import { isOfficialResult } from "@/lib/official";
import { esPreCheckReal } from "@/services/prechecks/cliente";
import { GuardarMarcador } from "@/features/marcadores/components/guardar-marcador";
import { fotoDeRegla } from "@/features/marcadores/lib/marcadores";
import { hasMeasurement, recommendedAction } from "../../lib/rule-copy";
import { MeasurementBlock } from "./measurement-block";
import { RegulationBlock } from "./regulation-block";
import { ReviewActions } from "./review-actions";
import { RevisionDoyc } from "./revision-doyc";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-compact font-semibold text-ink">{title}</h4>
      {children}
    </section>
  );
}

interface RuleDetailsProps {
  item: RuleResult | null;
  precheckId: string;
  /** En el drawer de tableta el título lo pone el Sheet. */
  hideHeading?: boolean;
  /**
   * Expediente o PreCheck real: sin comentarios ni asignación (revisores y anotaciones son de la demostración). En un
   * PreCheck real (pck-…) el revisor sí confirma o contradice las decisiones de la IA (bloque «Revisión DOYC»).
   */
  soloLectura?: boolean;
  /** Expediente real: para enlazar las páginas de la evidencia del dictamen con la pestaña Planos. */
  expediente?: { projectId: string; info: ExpedienteInfo };
}

export function RuleDetails({ item, precheckId, hideHeading, soloLectura = false, expediente }: RuleDetailsProps) {
  if (!item) {
    return <EmptyState className="m-4" icon={MousePointerClick} title="Ninguna regla seleccionada" body="Elija una regla de la lista para ver su medición, la norma y las acciones de revisión." />;
  }
  const { rule, result } = item;
  const official = isOfficialResult(item);
  return (
    <section aria-labelledby="rule-details-title" className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        {hideHeading ? null : <h2 className="text-xs font-normal text-ink-muted">Detalle de la regla</h2>}
        <h3 id="rule-details-title" className="text-base leading-snug font-semibold text-ink">{rule.title}</h3>
        <p className="tabular text-xs text-ink-muted">{rule.id} · v{rule.version}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ComplianceBadge status={result.status} official={official} faltaEnPlano={result.faltaEnPlano} conSupuesto={result.conSupuesto} />
          {!official ? <UnofficialTag /> : null}
          {rule.demo ? <span className="rounded border px-1.5 py-0.5 text-xs text-ink-muted">demostración</span> : null}
          {result.fueraDeCatalogo ? <FueraDeCatalogoTag /> : null}
        </div>
        <GuardarMarcador ruleId={rule.id} foto={(proyecto) => fotoDeRegla(proyecto, rule.title, result)} />
        {result.fueraDeCatalogo ? (
          <p role="note" className="rounded-md border border-warning/40 bg-warning-soft px-2.5 py-2 text-sm text-ink">
            Este hallazgo lo propone la IA a partir de la norma citada; no es una regla del catálogo ni lo evaluó el motor. Compare con el plano y valídelo antes de darlo por válido (otra revisión de la IA puede incluirlo o no).
          </p>
        ) : null}
      </header>
      {hasMeasurement(item) ? <MeasurementBlock item={item} /> : null}
      <Block title="Descripción">
        <p className="text-sm text-ink">{rule.description}</p>
      </Block>
      <Block title="Norma">
        <RegulationBlock rule={rule} />
      </Block>
      {result.dictamen ? (
        <Block title={result.dictamen.origen === "motor" ? "Decisión de respaldo del motor" : "Dictamen del arquitecto revisor"}>
          <div className="rounded-md border bg-muted/50 p-3">
            <DecisionDictamenDetalle result={result} projectId={expediente?.projectId} paginas={expediente?.info.miniaturas} />
            <p className="mt-2 text-xs text-ink-muted">
              Fuente: {result.dictamen.origen === "motor" ? FUENTE_RESPALDO : FUENTE_DICTAMEN}. Preliminar y no oficial: el visto bueno final es del Revisor DOYC.
            </p>
          </div>
        </Block>
      ) : result.explanation ? (
        <Block title="Explicación asistida">
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-sm text-ink">{result.explanation}</p>
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
              <Sparkles aria-hidden className="size-3" />
              Texto de apoyo generado a partir de la regla y los valores. No es un dictamen.
            </p>
          </div>
        </Block>
      ) : null}
      {result.dictamen?.subsanar ? null : (
        <Block title="Acción recomendada">
          <p className="text-sm text-ink">{recommendedAction(item)}</p>
        </Block>
      )}
      <RevisionBlock item={item} precheckId={precheckId} soloLectura={soloLectura} />
    </section>
  );
}

/**
 * Qué puede hacer el revisor con la regla. PreCheck real (pck-…): confirmar o contradecir el dictamen de la IA; si la
 * decidió el motor, se corrige el dato y se vuelve a evaluar. Expediente del agente (exp-…): solo lectura. Demostración:
 * las acciones de prueba (comentar, marcar, asignar).
 */
function RevisionBlock({ item, precheckId, soloLectura }: { item: RuleResult; precheckId: string; soloLectura: boolean }) {
  const { rule, result } = item;
  if (esPreCheckReal(precheckId)) {
    return result.dictamen ? (
      <Block title="Revisión DOYC">
        <RevisionDoyc precheckId={precheckId} ruleId={rule.id} />
      </Block>
    ) : (
      <Block title="Revisión">
        <p className="text-sm text-ink-muted">La decidió el motor con los datos del plano; para cambiarla corrija el dato en el lector y vuelva a evaluar.</p>
      </Block>
    );
  }
  return (
    <Block title="Revisión">
      {soloLectura ? (
        <p className="text-sm text-ink-muted">
          Expediente de solo lectura: el resultado lo produjo el agente revisor-planos{result.dictamen ? " (dictamen del arquitecto revisor)" : ""}. Los comentarios y la asignación de revisor
          no están disponibles aquí; la revisión la hace el personal de la DOYC.
        </p>
      ) : (
        <ReviewActions precheckId={precheckId} ruleId={rule.id} />
      )}
    </Block>
  );
}
