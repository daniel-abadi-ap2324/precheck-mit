import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import type { Project } from "@/types";
import { StatusBadge } from "@/components/status";
import { ComplianceMeter } from "@/components/project-card";
import { formatDate } from "@/lib/format";
import { projectStatusMeta } from "@/lib/status";
import { ProjectActionsMenu } from "../components/project-actions-menu";
import type { ProjectTableFeatures } from "./table-features";

const col = createColumnHelper<ProjectTableFeatures, Project>();

/** Columnas de proyecto compartidas por el panel y el listado. */
export const projectColumns = col.columns([
  col.accessor("name", {
    header: "Proyecto",
    sortFn: "text",
    cell: (info) => (
      <Link href={`/projects/${info.row.original.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        {info.getValue()}
      </Link>
    ),
    meta: { className: "min-w-48" },
  }),
  col.accessor("address", {
    header: "Dirección",
    sortFn: "text",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
    meta: { className: "min-w-52" },
  }),
  col.accessor("zoningCode", {
    header: "Zonificación",
    sortFn: "alphanumeric",
    // Código vacío = zona sin determinar: se lee «Por revisar», no como una zona más.
    cell: (info) => info.getValue() || <span className="text-muted-foreground">Por revisar</span>,
  }),
  col.accessor((p) => projectStatusMeta[p.status].label, {
    id: "status",
    header: "Estado",
    sortFn: "text",
    cell: (info) => <StatusBadge status={info.row.original.status} size="sm" />,
  }),
  col.accessor((p) => p.complianceIndex ?? -1, {
    id: "complianceIndex",
    header: "Índice preliminar",
    sortFn: "basic",
    cell: (info) => <ComplianceMeter value={info.row.original.complianceIndex} />,
    meta: { label: "Índice preliminar" },
  }),
  col.accessor((p) => new Date(p.updatedAt), {
    id: "updatedAt",
    header: "Última actualización",
    sortFn: "datetime",
    cell: (info) => (
      <time dateTime={info.row.original.updatedAt} className="tabular whitespace-nowrap text-muted-foreground">
        {formatDate(info.row.original.updatedAt)}
      </time>
    ),
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: (info) => <ProjectActionsMenu project={info.row.original} />,
    meta: { className: "w-10 text-right" },
  }),
]);
