"use client";

import { useBreakpoint } from "@/hooks/use-breakpoint";

export type WorkspaceLayout = "desktop" | "tablet" | "mobile";

/**
 * Escritorio ≥ 1280 px: tres paneles. Tableta 768–1279 px: reglas + plano y detalle en drawer. Móvil: un panel a la vez.
 * En el servidor asume móvil (se corrige al hidratar).
 */
export function useWorkspaceLayout(): WorkspaceLayout {
  const desktop = useBreakpoint("xl");
  const tablet = useBreakpoint("md");
  return desktop ? "desktop" : tablet ? "tablet" : "mobile";
}
