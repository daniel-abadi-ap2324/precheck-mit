import { SESSION_COOKIE, useSessionStore } from "@/stores/session";

/**
 * Las rutas /api responden 401 «auth.sin_sesion» si falta la cookie de sesión de demostración. Si el navegador la
 * perdió pero la sesión sigue guardada en localStorage, la pantalla carga y cada acción dice «Inicie sesión para
 * continuar». Esta protección reescribe la cookie desde la sesión guardada y repite la solicitud una vez; si no hay
 * sesión (o sigue el 401), cierra la sesión y lleva al login.
 */
let instalada = false;

const esApiPropia = (input: RequestInfo | URL): boolean => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
};

export function instalarGuardaDeSesion(): void {
  if (instalada || typeof window === "undefined") return;
  instalada = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    if (res.status !== 401 || !esApiPropia(input)) return res;
    const guardada = useSessionStore.getState().session;
    // El cuerpo de la solicitud original solo se puede repetir si es texto (JSON) o no hay.
    const repetible = init?.body === undefined || init.body === null || typeof init.body === "string";
    if (guardada && repetible) {
      document.cookie = `${SESSION_COOKIE}=${guardada.token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      const segundo = await original(input, init);
      if (segundo.status !== 401) return segundo;
    }
    useSessionStore.getState().signOut();
    const destino = `${window.location.pathname}${window.location.search}`;
    // Navegación completa a propósito (reinicia el estado de la app); URL absoluta del mismo origen.
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", destino);
    window.location.assign(login.href);
    return res;
  };
}
