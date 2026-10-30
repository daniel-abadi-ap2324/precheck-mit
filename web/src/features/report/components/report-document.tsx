import type { ReactNode } from "react";
import { ConclusionDictamen, QueSeSupuso } from "@/components/expediente";
import type { ReportModel } from "../lib/report-model";
import { sectionsOf, type ReportSection as Section } from "../lib/sections";
import { ReportSection } from "./report-section";
import { HeaderSection } from "./sections/header-section";
import { LotInfo, PlansInfo, ProjectInfo, ZoningInfo } from "./sections/info-sections";
import { ObservationsSection } from "./sections/observations-section";
import { PassingSection } from "./sections/passing-section";
import { RuleTable } from "./sections/rule-table";
import { RevisorNarrative } from "./sections/revisor-section";
import { ReferencesSection, ScopeSection } from "./sections/scope-references";
import { SummarySection } from "./sections/summary-section";

type Renderer = (m: ReportModel) => ReactNode;

const BODIES: Record<string, Renderer> = {
  "que-se-supuso": (m) => (m.project.expediente ? <QueSeSupuso info={m.project.expediente} titulo={false} /> : null),
  dictamen: (m) => (m.dictamen ? <ConclusionDictamen dictamen={m.dictamen} /> : null),
  proyecto: (m) => <ProjectInfo model={m} />,
  lote: (m) => <LotInfo model={m} />,
  zonificacion: (m) => <ZoningInfo model={m} />,
  planos: (m) => <PlansInfo model={m} />,
  resumen: (m) => <SummarySection model={m} />,
  "informe-revisor": (m) => (m.precheck.informeRevisor ? <RevisorNarrative markdown={m.precheck.informeRevisor} /> : null),
  "no-cumplen": (m) => <RuleTable items={m.failing} empty="Ninguna regla evaluada resultó «No cumple»." />,
  observaciones: (m) => <RuleTable items={m.warnings} empty="Ninguna regla evaluada quedó como observación." />,
  "requieren-revision": (m) => <RuleTable items={m.manual} empty="Ninguna regla requiere revisión." />,
  cumplen: (m) => <PassingSection model={m} />,
  "observaciones-redactadas": (m) => <ObservationsSection model={m} />,
  alcance: (m) => <ScopeSection model={m} />,
  referencias: (m) => <ReferencesSection model={m} />,
};

export const REPORT_DOCUMENT_ID = "informe-precheck";

/** Documento imprimible (ancho carta, márgenes amplios). La vista previa del profesional lleva marca de agua. */
export function ReportDocument({ model }: { model: ReportModel }) {
  const preview = model.version === "profesional" && !model.canIssue;
  const sections: Section[] = sectionsOf(model);
  return (
    <article
      id={REPORT_DOCUMENT_ID}
      aria-label={`Informe preliminar, ${model.version === "revisor" ? "versión del revisor" : "versión del profesional"}`}
      className="relative mx-auto w-full max-w-[8.5in] overflow-hidden rounded-lg border bg-card px-5 py-8 text-foreground sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:p-0"
    >
      {preview ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-start justify-center pt-[40vh] select-none print:fixed">
          <span className="-rotate-30 text-5xl font-semibold whitespace-nowrap text-fail/10 sm:text-7xl">Vista previa — no emitida</span>
        </div>
      ) : null}
      <div className="relative flex flex-col gap-6">
        <HeaderSection model={model} />
        {sections
          .filter((s) => s.id !== "encabezado")
          .map((s) => (
            <ReportSection key={s.id} section={s}>
              {BODIES[s.id]?.(model)}
            </ReportSection>
          ))}
        <footer className="border-t pt-3 text-xs text-ink-muted">
          Expediente {model.project.id} · Evaluación {model.precheck.id} ·{" "}
          {model.precheck.fuenteResultado ? `Fuente: ${model.precheck.fuenteResultado}` : `Motor ${model.precheck.engineVersion}`} · Informe no emitido, sin huella.
        </footer>
      </div>
    </article>
  );
}
