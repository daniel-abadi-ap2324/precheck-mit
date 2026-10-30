"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Suscripción a una media query. En el servidor (y en la primera pasada de hidratación)
 * devuelve `serverValue`: cada llamador declara qué vista asume para evitar saltos.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
