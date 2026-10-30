import { beforeEach, describe, expect, it, vi } from "vitest";

const leerCookie = () => document.cookie.split("; ").find((c) => c.startsWith("mp_session="));
const borrarCookie = () => {
  document.cookie = "mp_session=; path=/; max-age=0";
};

beforeEach(() => {
  localStorage.clear();
  borrarCookie();
  vi.resetModules();
});

describe("sesión de demostración", () => {
  it("al abrir la app con una sesión guardada vuelve a escribir la cookie que el navegador perdió", async () => {
    localStorage.setItem("mp-session", JSON.stringify({ state: { session: { token: "tok-1", user: { email: "a@example.test" } } }, version: 0 }));
    expect(leerCookie()).toBeUndefined();
    await import("./session");
    expect(leerCookie()).toBe("mp_session=tok-1");
  });

  it("sin sesión guardada no escribe ninguna cookie", async () => {
    await import("./session");
    expect(leerCookie()).toBeUndefined();
  });

  it("entrar escribe la cookie y salir la borra", async () => {
    const { useSessionStore } = await import("./session");
    useSessionStore.getState().signIn({ token: "tok-2", user: { email: "b@example.test" } } as never);
    expect(leerCookie()).toBe("mp_session=tok-2");
    useSessionStore.getState().signOut();
    expect(leerCookie()).toBeUndefined();
  });
});
