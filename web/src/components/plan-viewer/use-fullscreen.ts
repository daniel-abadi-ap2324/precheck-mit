"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** Pantalla completa con la Fullscreen API; el estado sigue al documento (Esc incluido). */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (document.fullscreenEnabled) void ref.current?.requestFullscreen();
  }, [ref]);

  return { active, toggle };
}
