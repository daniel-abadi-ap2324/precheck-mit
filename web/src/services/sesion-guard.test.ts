import { beforeEach, describe, expect, it, vi } from "vitest";

const sinSesion = () => new Response(JSON.stringify({ code: "auth.sin_sesion" }), { status: 401 });
const ok = () => new Response("{}", { status: 200 });
let original: ReturnType<typeof vi.fn>;
const assign = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.cookie = "mp_session=; path=/; max-age=0";
  assign.mockClear();
  original = vi.fn();
  vi.stubGlobal("fetch", original);
  Object.defineProperty(window, "location", { value: { origin: "http://localhost:3000", pathname: "/projects/x/precheck", search: "", assign }, writable: true });
});

async function conGuarda(sesion: boolean) {
  if (sesion) localStorage.setItem("mp-session", JSON.stringify({ state: { session: { token: "tok", user: { email: "a@example.test" } } }, version: 0 }));
  const { instalarGuardaDeSesion } = await import("./sesion-guard");
  document.cookie = "mp_session=; path=/; max-age=0"; // el navegador la perdió
  instalarGuardaDeSesion();
}

describe("guarda de sesión", () => {
  it("con sesión guardada, reescribe la cookie y repite la solicitud", async () => {
    original.mockResolvedValueOnce(sinSesion()).mockResolvedValueOnce(ok());
    await conGuarda(true);
    const r = await window.fetch("/api/prechecks/x/ia", { method: "POST", body: "{}" });
    expect(r.status).toBe(200);
    expect(original).toHaveBeenCalledTimes(2);
    expect(document.cookie).toContain("mp_session=tok");
    expect(assign).not.toHaveBeenCalled();
  });

  it("sin sesión guardada, lleva al login con la página de origen", async () => {
    original.mockResolvedValue(sinSesion());
    await conGuarda(false);
    const r = await window.fetch("/api/ia");
    expect(r.status).toBe(401);
    expect(assign).toHaveBeenCalledWith("http://localhost:3000/login?next=%2Fprojects%2Fx%2Fprecheck");
  });

  it("no toca otras solicitudes ni otros errores", async () => {
    original.mockResolvedValue(new Response("x", { status: 500 }));
    await conGuarda(true);
    expect((await window.fetch("/api/ia")).status).toBe(500);
    original.mockResolvedValue(sinSesion());
    expect((await window.fetch("https://otro.example/api/x")).status).toBe(401);
    expect(original).toHaveBeenCalledTimes(2);
  });
});
