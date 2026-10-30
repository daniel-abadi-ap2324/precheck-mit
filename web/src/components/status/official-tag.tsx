import { cn } from "@/lib/utils";

/** Marca «no oficial»: el resultado viene de una regla no aprobada (CONTEXT.md, «Resultado indicativo»). */
export function UnofficialTag({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded border border-dashed border-input px-1.5 py-0.5 text-xs text-ink-muted", className)}
      title="La regla está en borrador: el resultado es indicativo y no oficial."
    >
      no oficial
    </span>
  );
}

/** Hallazgo que propone la IA sin que haya una regla del catálogo detrás: un revisor debe validarlo. */
export function FueraDeCatalogoTag({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning", className)}
      title="Lo propone la IA a partir de la norma citada; no es una regla del catálogo y el motor no lo evaluó. Un revisor debe validarlo."
    >
      Propuesto por la IA · fuera del catálogo
    </span>
  );
}

/**
 * Marca de un expediente real revisado por el agente revisor-planos: separa estos proyectos de los de demostración
 * y recuerda que el resultado es preliminar.
 */
export function ExpedienteTag({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded border border-info/40 bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info", className)}
      title="Resultado real del agente revisor-planos sobre un expediente. Es preliminar: no sustituye el dictamen técnico de la DOYC (Acuerdo 110, Art. 3)."
    >
      Expediente real · resultado preliminar
    </span>
  );
}
