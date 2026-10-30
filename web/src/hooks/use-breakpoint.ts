"use client";

import { useMediaQuery } from "./use-media-query";

/**
 * Puntos de corte de la app, los mismos de Tailwind: md = tableta, lg = paneles laterales fijos (mapa),
 * xl = revisión en tres columnas. Úsense estos nombres en vez de escribir píxeles en cada pantalla.
 */
export const BREAKPOINTS = { md: 768, lg: 1024, xl: 1280 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;

/** ¿La ventana mide al menos el punto de corte? `serverValue` es lo que se asume antes de hidratar. */
export function useBreakpoint(bp: Breakpoint, serverValue = false): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[bp]}px)`, serverValue);
}
