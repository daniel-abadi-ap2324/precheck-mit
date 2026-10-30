import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

const req = (path: string, session = false) =>
  new NextRequest(`http://localhost${path}`, { headers: session ? { cookie: "mp_session=demo-token" } : {} });

describe("proxy", () => {
  it("una ruta de la API sin sesión responde 401 JSON, no una redirección a HTML", async () => {
    const res = proxy(req("/api/geocodificar?q=Obarrio"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "auth.sin_sesion", message: "Inicie sesión para continuar." });
  });

  it("una página sin sesión redirige al login conservando el destino", () => {
    const res = proxy(req("/projects/abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?next=%2Fprojects%2Fabc");
  });

  it("el matcher no deja fuera rutas de la aplicación solo por su extensión", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/projects/abc.json")).toBe(true);
    expect(re.test("/api/geocodificar")).toBe(true);
    expect(re.test("/data/dgz/10-3B.geojson")).toBe(false);
    expect(re.test("/maplibre/maplibre-gl-worker.mjs")).toBe(false);
    expect(re.test("/_next/static/chunks/a.js")).toBe(false);
    // La carga de planos no pasa por el proxy (limita el cuerpo a 10 MB): la ruta verifica la sesión ella misma.
    expect(re.test("/api/planos")).toBe(false);
    expect(re.test("/api/planos/plan-1/paginas/1")).toBe(true);
  });
});
