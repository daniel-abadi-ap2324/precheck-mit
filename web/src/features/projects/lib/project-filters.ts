import type { ProjectStatus } from "@/types";
import { projectStatusMeta } from "@/lib/status";

export type ProjectsView = "table" | "cards";

export interface ProjectFilters {
  q: string;
  status: ProjectStatus | null;
  view: ProjectsView;
}

export const PROJECT_STATUSES = Object.keys(projectStatusMeta) as ProjectStatus[];

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lee ?q, ?status y ?view descartando valores no válidos. */
export function parseProjectFilters(params: RawParams): ProjectFilters {
  const status = first(params.status);
  return {
    q: first(params.q)?.slice(0, 120) ?? "",
    status: PROJECT_STATUSES.includes(status as ProjectStatus) ? (status as ProjectStatus) : null,
    view: first(params.view) === "cards" ? "cards" : "table",
  };
}

/** Serializa solo lo que difiere del valor por defecto, para URLs limpias. */
export function serializeProjectFilters(f: ProjectFilters): string {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set("q", f.q.trim());
  if (f.status) sp.set("status", f.status);
  if (f.view === "cards") sp.set("view", "cards");
  const s = sp.toString();
  return s ? `?${s}` : "";
}
