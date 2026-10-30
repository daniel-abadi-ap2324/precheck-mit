"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Size } from "./use-pan-zoom";

const FALLBACK: Size = { width: 800, height: 600 };

/** Tamaño del elemento vía ResizeObserver. `measured` indica si ya hubo una medición real. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<{ size: Size; measured: boolean }>({ size: FALLBACK, measured: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setState({ size: { width, height }, measured: true });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return state;
}
