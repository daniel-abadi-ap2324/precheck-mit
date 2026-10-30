"use client";

import { useBreakpoint } from "@/hooks/use-breakpoint";

/** Escritorio del mapa = paneles laterales fijos (lg); debajo, hojas inferiores. En el servidor asume escritorio. */
export const useIsDesktop = () => useBreakpoint("lg", true);
