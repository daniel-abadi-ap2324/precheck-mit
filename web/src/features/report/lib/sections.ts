import type { ReportModel, ReportVersion } from "./report-model";

export interface ReportSection {
  id: string;
  title: string;
}

const ALL: Record<string, ReportSection> = {
  encabezado: { id: "encabezado", title: "Encabezado" },
  supuestos: { id: "que-se-supuso", title: "Qué se supuso en esta revisión" },
  dictamen: { id: "dictamen", title: "Dictamen del arquitecto revisor" },
  proyecto: { id: "proyecto", title: "Información del proyecto" },
  lote: { id: "lote", title: "Información del lote" },
  zonificacion: { id: "zonificacion", title: "Zonificación" },
  planos: { id: "planos", title: "Planos analizados" },
  resumen: { id: "resumen", title: "Resumen de cumplimiento" },
  informeRevisor: { id: "informe-revisor", title: "Informe del revisor automático" },
  noCumplen: { id: "no-cumplen", title: "Reglas que no cumplen" },
  observaciones: { id: "observaciones", title: "Observaciones" },
  revision: { id: "requieren-revision", title: "Requieren revisión" },
  cumplen: { id: "cumplen", title: "Reglas que cumplen" },
  redactadas: { id: "observaciones-redactadas", title: "Observaciones redactadas" },
  alcance: { id: "alcance", title: "Alcance de esta verificación" },
  referencias: { id: "referencias", title: "Referencias normativas" },
};

/**
 * Secciones por versión. La del profesional no lleva el detalle por regla de los indicativos:
 * solo observaciones redactadas y el conteo de cumplimientos (spec informe-precheck, AC-09).
 */
export function sectionsFor(version: ReportVersion, opciones: { informeRevisor?: boolean; dictamen?: boolean; supuestos?: boolean } = {}): ReportSection[] {
  const s = ALL;
  // «Qué se supuso en esta revisión» (ADR-0016) primero, y la conclusión del arquitecto revisor (expedientes con
  // dictamen.json) después: los dos arriba, en las dos versiones.
  const dictamen = [...(opciones.supuestos ? [s.supuestos] : []), ...(opciones.dictamen ? [s.dictamen] : [])];
  if (version === "profesional") {
    return [s.encabezado, ...dictamen, s.proyecto, s.lote, s.zonificacion, s.planos, s.resumen, s.redactadas, s.cumplen, s.alcance, s.referencias];
  }
  // El informe narrativo del agente revisor-planos (expedientes reales) es de uso interno: solo en la del revisor.
  const narrativa = opciones.informeRevisor ? [s.informeRevisor] : [];
  return [s.encabezado, ...dictamen, s.proyecto, s.lote, s.zonificacion, s.planos, s.resumen, ...narrativa, s.noCumplen, s.observaciones, s.revision, s.cumplen, s.redactadas, s.alcance, s.referencias];
}

/** Secciones del informe de un modelo concreto (con el informe del revisor automático si lo hay). */
export const sectionsOf = (m: Pick<ReportModel, "version" | "precheck" | "dictamen" | "supuestos">) =>
  sectionsFor(m.version, { informeRevisor: Boolean(m.precheck.informeRevisor?.trim()), dictamen: Boolean(m.dictamen), supuestos: Boolean(m.supuestos) });

export const sectionHeadingId = (id: string) => `${id}-titulo`;
