"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bounds } from "./types";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;
const FIT_MARGIN = 0.94;

/** Vista en coordenadas del plano: centro (m) y zoom relativo a «ajustar lámina». */
export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Zoom y desplazamiento por matriz de transformación. La vista se guarda en metros,
 * así que redimensionar el panel no desplaza el plano.
 */
export function usePanZoom(sheet: Size, size: Size) {
  const fitView = useMemo<View>(() => ({ cx: sheet.width / 2, cy: sheet.height / 2, zoom: 1 }), [sheet.width, sheet.height]);
  const [view, setView] = useState<View>(fitView);
  const frame = useRef<number | null>(null);

  const baseScale = (Math.min(size.width / sheet.width, size.height / sheet.height) || 1) * FIT_MARGIN;
  const scale = baseScale * view.zoom;
  const tx = size.width / 2 - view.cx * scale;
  const ty = size.height / 2 - view.cy * scale;

  const cancel = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const animateTo = useCallback((target: View) => {
    cancel();
    if (prefersReducedMotion()) {
      frame.current = requestAnimationFrame(() => setView(target));
      return;
    }
    let start: number | null = null;
    let from: View | null = null;
    const step = (t: number) => {
      start ??= t;
      const p = Math.min(1, (t - start) / 320);
      const e = 1 - Math.pow(1 - p, 3);
      setView((cur) => {
        from ??= cur;
        return { cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, zoom: from.zoom + (target.zoom - from.zoom) * e };
      });
      frame.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => cancel, []);

  /** Zoom manteniendo fijo el punto de pantalla (px, py). */
  const zoomAt = useCallback(
    (factor: number, px = size.width / 2, py = size.height / 2) => {
      cancel();
      setView((v) => {
        const k = baseScale * v.zoom;
        const wx = v.cx + (px - size.width / 2) / k;
        const wy = v.cy + (py - size.height / 2) / k;
        const zoom = clampZoom(v.zoom * factor);
        const k2 = baseScale * zoom;
        return { zoom, cx: wx - (px - size.width / 2) / k2, cy: wy - (py - size.height / 2) / k2 };
      });
    },
    [baseScale, size.width, size.height],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cancel();
      setView((v) => ({ ...v, cx: v.cx - dx / (baseScale * v.zoom), cy: v.cy - dy / (baseScale * v.zoom) }));
    },
    [baseScale],
  );

  const fitBounds = useCallback(
    (b: Bounds) => {
      const w = Math.max(b.maxX - b.minX, 0.5);
      const h = Math.max(b.maxY - b.minY, 0.5);
      const zoom = clampZoom((Math.min(size.width / w, size.height / h) * FIT_MARGIN) / baseScale);
      animateTo({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom });
    },
    [animateTo, baseScale, size.width, size.height],
  );

  const fit = useCallback(() => animateTo(fitView), [animateTo, fitView]);

  /** Pantalla → metros del plano. */
  const toWorld = useCallback((px: number, py: number): [number, number] => [(px - tx) / scale, (py - ty) / scale], [tx, ty, scale]);

  return { view, scale, tx, ty, zoomAt, panBy, fitBounds, fit, toWorld };
}
