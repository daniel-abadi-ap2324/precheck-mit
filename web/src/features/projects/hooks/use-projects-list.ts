"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type ProjectQuery } from "@/services/api";
import { queryKeys } from "@/lib/query-keys";

/** Como useProjects, pero conserva la lista anterior mientras llega la filtrada (sin parpadeo al escribir). */
export function useProjectsList(q: ProjectQuery) {
  return useQuery({ queryKey: queryKeys.projects(q), queryFn: () => api.listProjects(q), placeholderData: keepPreviousData });
}
