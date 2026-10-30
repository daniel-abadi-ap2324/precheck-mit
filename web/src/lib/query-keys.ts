import type { ProjectQuery } from "@/services/api";

export const queryKeys = {
  projects: (q: ProjectQuery = {}) => ["projects", q] as const,
  project: (id: string) => ["project", id] as const,
  parcels: (q: string) => ["parcels", q] as const,
  addresses: (q: string) => ["addresses", q] as const,
  property: (parcelId: string) => ["property", parcelId] as const,
  gisLayer: (layer: string) => ["gis", layer] as const,
  zoningIndex: () => ["gis", "zoning-index"] as const,
  zoningSheet: (hoja: string) => ["gis", "zoning-sheet", hoja] as const,
  plans: (projectId: string) => ["plans", projectId] as const,
  plan: (planId: string) => ["plan", planId] as const,
  planRegions: (planId: string) => ["plan-regions", planId] as const,
  planExamples: () => ["plan-examples"] as const,
  precheck: (id: string) => ["precheck", id] as const,
  progress: (id: string) => ["precheck-progress", id] as const,
  revision: (id: string) => ["precheck-revision", id] as const,
  rules: () => ["rules"] as const,
  zonings: () => ["zonings"] as const,
  reviewers: () => ["reviewers"] as const,
  notifications: () => ["notifications"] as const,
  rondas: () => ["rondas"] as const,
  /** Sin proyecto: todos. Invalidar ["marcadores"] refresca las dos variantes. */
  marcadores: (projectId?: string) => (projectId ? (["marcadores", projectId] as const) : (["marcadores"] as const)),
};
