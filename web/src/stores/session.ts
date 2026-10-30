import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Session } from "@/types";

export const SESSION_COOKIE = "mp_session";
/** 7 días. Sin esto la cookie moría al cerrar el navegador y la sesión guardada en localStorage seguía «abierta»: la pantalla cargaba, pero las rutas /api respondían «Inicie sesión para continuar». */
const DURACION_S = 7 * 24 * 60 * 60;
const escribirCookie = (token: string) => {
  document.cookie = `${SESSION_COOKIE}=${token}; path=/; max-age=${DURACION_S}; SameSite=Lax`;
};

interface SessionState {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      signIn: (session) => {
        escribirCookie(session.token);
        set({ session });
      },
      signOut: () => {
        document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
        set({ session: null });
      },
    }),
    {
      name: "mp-session",
      storage: createJSONStorage(() => localStorage),
      // Al abrir la app con una sesión guardada, la cookie se vuelve a escribir (si el navegador la perdió).
      onRehydrateStorage: () => (state) => {
        if (state?.session && typeof document !== "undefined") escribirCookie(state.session.token);
      },
    },
  ),
);
