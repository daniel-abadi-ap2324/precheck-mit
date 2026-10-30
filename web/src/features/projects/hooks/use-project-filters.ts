"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { serializeProjectFilters, type ProjectFilters } from "../lib/project-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/**
 * Filtros del listado sincronizados con la URL (?q, ?status, ?view) para compartirlos por enlace.
 * La búsqueda se aplica con retardo; el estado y la vista, al instante.
 */
export function useProjectFilters(initial: ProjectFilters) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initial);
  const debouncedQ = useDebouncedValue(filters.q, 300);
  const applied: ProjectFilters = { ...filters, q: debouncedQ };
  const url = `${pathname}${serializeProjectFilters(applied)}`;

  const lastUrl = useRef(url);
  useEffect(() => {
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    router.replace(url, { scroll: false });
  }, [url, router]);

  const update = useCallback((patch: Partial<ProjectFilters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const clear = useCallback(() => setFilters((f) => ({ ...f, q: "", status: null })), []);

  return { filters, applied, update, clear };
}
