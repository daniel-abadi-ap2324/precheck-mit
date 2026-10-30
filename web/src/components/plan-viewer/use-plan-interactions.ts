"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import type { PlanViewerTool } from "./types";

interface Controls {
  zoomAt: (factor: number, px?: number, py?: number) => void;
  panBy: (dx: number, dy: number) => void;
  fit: () => void;
  toWorld: (px: number, py: number) => [number, number];
}

interface Options extends Controls {
  tool: PlanViewerTool;
  onMeasurePoint: (p: [number, number]) => void;
  onHover: (p: [number, number] | null) => void;
  onCancel: () => void;
}

const ZOOM_STEP = 1.25;
const PAN_STEP = 48;
const local = (el: HTMLElement, x: number, y: number) => {
  const r = el.getBoundingClientRect();
  return { x: x - r.left, y: y - r.top };
};

/** Rueda/pellizco para zoom, arrastre para desplazar (herramienta Mover o espacio), clics de medición y teclado. */
export function usePlanInteractions(ref: RefObject<HTMLDivElement | null>, opts: Options) {
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = local(el, e.clientX, e.clientY);
      latest.current.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), x, y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);

  const panning = opts.tool === "pan" || spaceHeld;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e.currentTarget, e.clientX, e.clientY));
    moved.current = 0;
    if (panning || e.button === 1 || pointers.current.size > 1) setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = local(e.currentTarget, e.clientX, e.clientY);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (opts.tool === "measure") opts.onHover(opts.toWorld(p.x, p.y));
      return;
    }
    const all = [...pointers.current.entries()];
    if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)?.[1] ?? p;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(p.x - other.x, p.y - other.y) || 1;
      opts.zoomAt(after / before, (p.x + other.x) / 2, (p.y + other.y) / 2);
    } else if (dragging) {
      opts.panBy(p.x - prev.x, p.y - prev.y);
    } else if (opts.tool === "measure") {
      opts.onHover(opts.toWorld(p.x, p.y));
    }
    moved.current += Math.hypot(p.x - prev.x, p.y - prev.y);
    pointers.current.set(e.pointerId, p);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = local(e.currentTarget, e.clientX, e.clientY);
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
    if (wasSingle && !dragging && opts.tool === "measure" && moved.current < 5) opts.onMeasurePoint(opts.toWorld(p.x, p.y));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const actions: Record<string, () => void> = {
      "+": () => opts.zoomAt(ZOOM_STEP),
      "=": () => opts.zoomAt(ZOOM_STEP),
      "-": () => opts.zoomAt(1 / ZOOM_STEP),
      "0": () => opts.fit(),
      ArrowUp: () => opts.panBy(0, PAN_STEP),
      ArrowDown: () => opts.panBy(0, -PAN_STEP),
      ArrowLeft: () => opts.panBy(PAN_STEP, 0),
      ArrowRight: () => opts.panBy(-PAN_STEP, 0),
      " ": () => setSpaceHeld(true),
      Escape: () => opts.onCancel(),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") setSpaceHeld(false);
  };

  const onPointerLeave = () => opts.onHover(null);
  const cursor = dragging ? "grabbing" : panning ? "grab" : opts.tool === "measure" ? "crosshair" : "default";

  return { cursor, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave, onKeyDown, onKeyUp, onBlur: () => setSpaceHeld(false) } };
}
