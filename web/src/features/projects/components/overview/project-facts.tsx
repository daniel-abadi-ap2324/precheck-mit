import type { Project } from "@/types";
import { ExpedienteTag, StatusBadge } from "@/components/status";
import { ComplianceMeter } from "@/components/project-card";
import { formatDate } from "@/lib/format";
import { FactList, type FactRow } from "@/components/common";

/** Dato que no vino: «no consta», atenuado (nunca un campo vacío). */
const noConsta = (value: string, motivo = "no consta"): Pick<FactRow, "value" | "tone"> => (value ? { value } : { value: motivo, tone: "muted" });

/** Todos los datos del proyecto, en una lista de definiciones. */
export function ProjectFacts({ project }: { project: Project }) {
  const rows: FactRow[] = project.origen === "expediente" ? filasDeExpediente(project) : filasDeDemostracion(project);
  return (
    <section aria-labelledby="datos-proyecto" className="rounded-lg border bg-card p-4">
      <h2 id="datos-proyecto" className="mb-3 font-semibold">
        Datos del proyecto
      </h2>
      <FactList rows={rows} />
    </section>
  );
}

const filasDeDemostracion = (project: Project): FactRow[] => [
  { label: "Nombre", value: project.name },
  { label: "Estado", value: <StatusBadge status={project.status} size="sm" /> },
  { label: "Tipo de proyecto", value: project.projectType },
  { label: "Solicitante", value: project.applicant },
  { label: "Dirección", value: project.address },
  { label: "Corregimiento", value: project.corregimiento },
  { label: "Finca", value: <span className="tabular">{project.finca}</span> },
  { label: "ID del lote", value: <span className="tabular">{project.parcelId ?? "—"}</span> },
  { label: "Zonificación", value: project.zoningCode || "Por revisar" },
  { label: "Índice preliminar", value: <ComplianceMeter value={project.complianceIndex} showLabel /> },
  { label: "Identificador", value: <span className="tabular text-muted-foreground">{project.id}</span> },
  { label: "Última actualización", value: <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time> },
];

/** Expediente real: lo que no trae el expediente se dice («no consta»); el lote no tiene ID de catastro. */
const filasDeExpediente = (project: Project): FactRow[] => [
  { label: "Nombre", value: project.name },
  { label: "Origen", value: <ExpedienteTag /> },
  { label: "Estado", value: <StatusBadge status={project.status} size="sm" /> },
  { label: "Tipo de proyecto", ...noConsta(project.projectType) },
  { label: "Solicitante", ...noConsta(project.applicant, "no consta (no se expone en el PreCheck)") },
  { label: "Dirección", ...noConsta(project.address) },
  { label: "Corregimiento", ...noConsta(project.corregimiento) },
  { label: "Finca", ...noConsta(project.finca) },
  { label: "Zonificación", value: project.zoningCode ? `${project.zoningCode} (leída del plano; sin CEUS)` : "Por revisar" },
  { label: "Índice preliminar", value: <ComplianceMeter value={project.complianceIndex} showLabel /> },
  { label: "Identificador", value: <span className="tabular text-muted-foreground">{project.id}</span> },
  { label: "Fecha de la corrida", value: <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time> },
];
