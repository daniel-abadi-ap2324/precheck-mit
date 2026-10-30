"use client";

import { useEffect, useState } from "react";

/**
 * `true` desde que el elemento entra (o está a `margen` de entrar) en la ventana, y se queda en `true`: sirve para montar
 * tarde lo pesado (p. ej. la lámina grande del editor de regiones) sin perder lo editado al salir de la vista.
 * Sin IntersectionObserver (jsdom, navegadores antiguos) es `true` desde el principio.
 */
export function useEnVista<T extends Element>(margen = "300px"): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [visto, setVisto] = useState(() => typeof window !== "undefined" && typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!el || visto || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisto(true);
          observador.disconnect();
        }
      },
      { rootMargin: margen },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [el, visto, margen]);
  return [setEl, visto];
}
