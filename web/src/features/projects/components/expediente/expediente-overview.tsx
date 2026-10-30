import Link from "next/link";
import { CircleDashed, ClipboardCheck, FileQuestion, FileStack, FileText, Layers, ListChecks, MapPinned, TriangleAlert } from "lucide-react";
import type { ExpedienteInfo, PreCheck, Project } from "@/types";
import { Callout, FactList, LinkButton, PreliminaryNotice, type FactRow } from "@/components/common";
import { ComplianceIcon } from "@/components/status";
import { DatosLeidos, QueSeSupuso } from "@/components/expediente";
import { textoDeAviso } from "@/lib/avisos";
import { queSeSupuso } from "@/lib/supuestos";
import { ConclusionConMarcador } from "@/features/marcadores/components/conclusion-con-marcador";
import { FUENTE_DICTAMEN, textoNoAplican } from "@/lib/dictamen";
import { complianceMeta, toneClasses } from "@/lib/status";
import { formatDate, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProjectFacts } from "../overview/project-facts";
import { ProjectTimeline } from "../overview/project-timeline";

/** /projects/[id] de un expediente real: los datos del agente revisor-planos, sin nada de la demostración. */
export function ExpedienteOverview({ project, info, precheck }: { project: Project; info: ExpedienteInfo; precheck: PreCheck | undefined }) {
  return (
    <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_var(--spacing-panel)]">
      <div className="flex min-w-0 flex-col gap-4">
        <ExpedienteResultados project={project} info={info} />
        <ProjectFacts project={project} />
      </div>
      <aside aria-label="Lote, planos e historial" className="flex flex-col gap-4">
        <ExpedienteLoteResumen project={project} info={info} />
        <ExpedientePlanosResumen project={project} info={info} />
        <ProjectTimeline project={project} precheck={precheck} />
      </aside>
    </div>
  );
}

type ClaveConteo = keyof NonNullable<ExpedienteInfo["conteo"]>;
const CONTEO: { key: ClaveConteo; label: string; tone: keyof typeof toneClasses; icon?: typeof Layers; status?: "FAIL" | "WARNING" | "MANUAL_REVIEW" | "PASS" }[] = [
  { key: "noCumple", label: "No cumplen", tone: "fail", status: "FAIL" },
  { key: "conSupuesto", label: "No cumplen con supuesto", tone: "supuesto", icon: CircleDashed },
  { key: "observaciones", label: "Observaciones", tone: "warning", status: "WARNING" },
  { key: "informacionRequerida", label: "Información requerida", tone: "warning", icon: FileQuestion },
  { key: "revisar", label: "A revisar", tone: "manual", status: "MANUAL_REVIEW" },
  { key: "agrupadas", label: "Agrupadas por zona", tone: "manual", icon: Layers },
  { key: "cumple", label: "Cumplen", tone: "pass", status: "PASS" },
];

/**
 * Código de zona: la zona de trabajo del motor con su procedencia (ADR-0016), la que asumió el arquitecto revisor
 * (dictamen) o la leída del plano.
 */
function textoZona(project: Project, info: ExpedienteInfo): string | null {
  const zt = info.zonaTrabajo;
  if (zt) return zt.codigo ? `${zt.codigo} (${info.vigentes?.procedenciaZona ?? (zt.firme ? "firme" : "supuesta")})` : `sin zona de trabajo (falta ${zt.falta ?? "la CEUS"})`;
  const asumida = info.dictamen?.supuestos.find((s) => s.hecho === "lote.codigo_zona");
  if (asumida) return `${asumida.valor} (asumida por el arquitecto revisor; sin CEUS)`;
  return project.zoningCode ? `${project.zoningCode} (leído del plano; sin CEUS)` : null;
}

/** Resultados preliminares de la corrida: norma, código de zona, conteo, avisos del motor y fecha. */
function ExpedienteResultados({ project, info }: { project: Project; info: ExpedienteInfo }) {
  const base = `/projects/${project.id}`;
  const zona = textoZona(project, info);
  const filas: FactRow[] = [
    { label: "Norma aplicable", value: info.normaAplicable ?? "no consta", tone: info.normaAplicable ? "default" : "muted" },
    { label: "Código de zona", value: zona ?? "Por revisar", tone: zona ? "default" : "muted" },
    { label: "Fecha de la corrida", value: <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time> },
    ...(info.fechaPresentacion ? [{ label: "Fecha de presentación", value: formatDay(info.fechaPresentacion) }] : []),
    { label: "Reglas que no aplican", value: textoNoAplican(info) },
  ];
  const conteo = info.conteo;
  const tiles = CONTEO.filter(({ key }) => conteo?.[key] !== undefined);
  return (
    <section aria-labelledby="resumen-precheck" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="resumen-precheck" className="font-semibold">
          Resultados preliminares del PreCheck
        </h2>
        <p className="text-xs text-muted-foreground">{info.dictamen ? FUENTE_DICTAMEN : "agente revisor-planos"} · resultado no oficial</p>
      </header>
      <QueSeSupuso info={info} />
      {info.dictamen ? <ConclusionConMarcador project={project} dictamen={info.dictamen} /> : null}
      <FactList rows={filas} />
      {conteo ? (
        <ul className={cn("grid grid-cols-2 gap-2", tiles.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4")} aria-label="Resultados por estado">
          {tiles.map(({ key, label, tone, icon: Icon, status }) => (
            <li key={key} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {status ? <ComplianceIcon status={status} className="size-3.5" /> : Icon ? <Icon aria-hidden className={cn("size-3.5", toneClasses[tone].text)} /> : null}
                {label}
              </span>
              <span className="text-lg font-semibold">{conteo[key]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {info.zonaPorConfirmar ? (
        <p className="text-xs text-muted-foreground">
          {info.zonaTrabajo
            ? `Las ${info.zonaPorConfirmar.total} agrupadas son de otras zonas: información requerida (${info.zonaPorConfirmar.motivo}).`
            : `Las ${info.zonaPorConfirmar.total} agrupadas siguen en «${complianceMeta.MANUAL_REVIEW.label}»: ${info.zonaPorConfirmar.motivo}.`}
        </p>
      ) : null}
      {/* Con «Qué se supuso» (ADR-0016) los avisos ya van ahí, en lenguaje llano; si no, aquí. */}
      {info.avisos.length && !queSeSupuso(info) ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlert aria-hidden className={cn("size-4", toneClasses.warning.text)} />
            Avisos del motor
          </h3>
          {info.avisos.map((a, i) => (
            <Callout key={i} tone="warning">
              {textoDeAviso(a)}
            </Callout>
          ))}
        </div>
      ) : info.avisos.length ? null : (
        <p className="text-xs text-muted-foreground">El motor no dejó avisos en esta corrida.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`${base}/precheck`} size="sm">
          <ClipboardCheck aria-hidden />
          Revisión
        </LinkButton>
        <LinkButton href={`${base}/results`} size="sm" variant="outline">
          <ListChecks aria-hidden />
          Resultados
        </LinkButton>
        <LinkButton href={`${base}/report`} size="sm" variant="outline">
          <FileText aria-hidden />
          Informe
        </LinkButton>
      </div>
      <PreliminaryNotice compact />
    </section>
  );
}

/** Lote leído del plano (no es el catastro): los hechos lote.* y plano.* con su confianza y fuente. */
function ExpedienteLoteResumen({ project, info }: { project: Project; info: ExpedienteInfo }) {
  return (
    <section aria-labelledby="lote-resumen" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <h2 id="lote-resumen" className="flex items-center gap-2 text-sm font-medium">
        <MapPinned aria-hidden className="size-4 text-muted-foreground" />
        Datos del lote leídos del plano (no es el catastro de la ANATI)
      </h2>
      <DatosLeidos datos={info.lote} umbral={info.umbral} label="Datos del lote leídos del plano" compacto />
      <Link href={`/projects/${project.id}/site`} className="self-start text-sm text-brand underline-offset-4 hover:underline">
        Ver los datos del lote con su fuente
      </Link>
    </section>
  );
}

/** El documento revisado: 1 documento con N páginas. */
function ExpedientePlanosResumen({ project, info }: { project: Project; info: ExpedienteInfo }) {
  const paginas = info.paginas ?? info.miniaturas?.length ?? null;
  return (
    <section aria-labelledby="planos-resumen" className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <FileStack aria-hidden className="size-5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h2 id="planos-resumen" className="text-sm font-medium">
          Planos del expediente
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className="tabular font-semibold text-foreground">1</span> documento
          {paginas !== null ? (
            <>
              {" "}
              con <span className="tabular font-semibold text-foreground">{paginas}</span> {paginas === 1 ? "página" : "páginas"}
            </>
          ) : null}
        </p>
        {info.documento ? (
          <p className="truncate text-xs text-muted-foreground" title={info.documento}>
            {info.documento}
          </p>
        ) : null}
      </div>
      <Link href={`/projects/${project.id}/plans`} className="text-sm text-brand underline-offset-4 hover:underline">
        Ver planos
      </Link>
    </section>
  );
}
