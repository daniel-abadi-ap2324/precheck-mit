import type { ExpedienteInfo, PreCheck, Project } from "@/types";
import { formatDay } from "@/lib/format";

export type TimelineState = "done" | "current" | "pending" | "failed";

export interface TimelineEvent {
  id: "created" | "run" | "results" | "review";
  title: string;
  detail?: string;
  /** ISO; ausente cuando el backend no entrega la fecha (no se inventa). */
  at?: string;
  state: TimelineState;
}

/** Hitos del proyecto: registro → ejecución del PreCheck → resultados → revisión humana. */
export function buildProjectTimeline(project: Project, precheck: PreCheck | undefined): TimelineEvent[] {
  if (project.origen === "expediente" && project.expediente) return timelineDeExpediente(project, project.expediente);
  const { status } = project;
  const created: TimelineEvent = { id: "created", title: "Proyecto registrado", ...(project.applicant ? { detail: `Solicitante: ${project.applicant}` } : {}), state: "done" };

  const run: TimelineEvent =
    status === "DRAFT"
      ? { id: "run", title: "PreCheck sin ejecutar", detail: "Complete los datos y cargue los planos.", state: "current" }
      : status === "PROCESSING"
        ? { id: "run", title: "PreCheck en proceso", detail: "Lectura de planos y evaluación de reglas.", at: precheck?.startedAt, state: "current" }
        : status === "FAILED"
          ? { id: "run", title: "El PreCheck falló", detail: "No se pudieron procesar los planos.", at: project.updatedAt, state: "failed" }
          : { id: "run", title: "PreCheck ejecutado", detail: precheck ? `Motor ${precheck.engineVersion}` : undefined, at: precheck?.startedAt, state: "done" };

  const hasResults = status === "REVIEW_REQUIRED" || status === "COMPLETED";
  const results: TimelineEvent = hasResults
    ? {
        id: "results",
        title: "Resultados preliminares",
        detail: precheck ? `${precheck.summary.checked} reglas evaluadas, ${precheck.summary.failed} no cumplen` : undefined,
        at: precheck?.finishedAt,
        state: "done",
      }
    : { id: "results", title: "Resultados preliminares", state: "pending" };

  const review: TimelineEvent =
    status === "COMPLETED"
      ? { id: "review", title: "Revisión cerrada", detail: "Revisada por personal de la DOYC.", at: project.updatedAt, state: "done" }
      : status === "REVIEW_REQUIRED"
        ? { id: "review", title: "Revisión de la DOYC", detail: "Pendiente de validación humana.", state: "current" }
        : { id: "review", title: "Revisión de la DOYC", state: "pending" };

  return [created, run, results, review];
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Conteo del expediente en una línea: no cumplen, observaciones (con dictamen), a revisar, agrupadas por zona y cumplen. */
export function textoConteo(c: NonNullable<ExpedienteInfo["conteo"]>): string {
  return [
    plural(c.noCumple, "no cumple", "no cumplen"),
    c.observaciones !== undefined ? plural(c.observaciones, "observación", "observaciones") : null,
    `${c.revisar} a revisar`,
    c.agrupadas ? `${plural(c.agrupadas, "agrupada", "agrupadas")} por zona sin confirmar` : null,
    plural(c.cumple, "cumple", "cumplen"),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Expediente real: presentación → corrida del agente revisor-planos → resultados → revisión humana. La fecha de la
 * corrida es la de resultado.json; la de presentación es la del expediente (texto, sin hora).
 */
function timelineDeExpediente(project: Project, e: ExpedienteInfo): TimelineEvent[] {
  const created: TimelineEvent = {
    id: "created",
    title: "Expediente presentado",
    detail: [e.documento, e.fechaPresentacion ? `presentación: ${formatDay(e.fechaPresentacion)}` : null].filter(Boolean).join(" · ") || undefined,
    state: "done",
  };
  const run: TimelineEvent = {
    id: "run",
    title: "Revisado por el agente revisor-planos",
    detail: [e.normaAplicable ? `Norma ${e.normaAplicable}` : null, project.zoningCode ? `zona ${project.zoningCode}` : null].filter(Boolean).join(", ") || undefined,
    at: project.updatedAt,
    state: "done",
  };
  const results: TimelineEvent = { id: "results", title: "Resultados preliminares", ...(e.conteo ? { detail: textoConteo(e.conteo) } : {}), at: project.updatedAt, state: "done" };
  const review: TimelineEvent = { id: "review", title: "Revisión de la DOYC", detail: "Pendiente de validación humana.", state: "current" };
  return [created, run, results, review];
}
