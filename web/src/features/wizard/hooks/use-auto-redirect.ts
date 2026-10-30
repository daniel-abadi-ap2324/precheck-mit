"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const AUTO_REDIRECT_MS = 1500;

/**
 * Redirige tras una pausa corta, salvo que la persona prefiera menos movimiento
 * o ya esté interactuando con la página (clic, tecla o toque).
 */
export function useAutoRedirect(href: string, armed: boolean) {
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const active = armed && !cancelled && !reducedMotion;

  useEffect(() => {
    if (!active) return;
    const cancel = () => setCancelled(true);
    const timer = setTimeout(() => router.push(href), AUTO_REDIRECT_MS);
    window.addEventListener("pointerdown", cancel, { once: true });
    window.addEventListener("keydown", cancel, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [active, href, router]);

  return { active, cancel: () => setCancelled(true) };
}
