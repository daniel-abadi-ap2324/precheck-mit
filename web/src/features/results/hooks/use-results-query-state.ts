"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseStatusFilter, type StatusFilter } from "../lib/results-model";

/** Filtro de estado (?status=) y búsqueda (?q=) guardados en la URL, para compartir la vista por enlace. */
export function useResultsQueryState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = parseStatusFilter(params.get("status"));
  const query = params.get("q") ?? "";

  const update = useCallback(
    (key: "status" | "q", value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const setStatus = useCallback((s: StatusFilter) => update("status", s === "ALL" ? null : s), [update]);
  const setQuery = useCallback((q: string) => update("q", q.trim() ? q : null), [update]);

  return { status, query, setStatus, setQuery };
}
