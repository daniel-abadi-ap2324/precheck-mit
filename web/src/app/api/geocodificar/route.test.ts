import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const photon = { features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-79.52, 8.99] }, properties: { osm_type: "W", osm_id: 7, name: "Vía España", district: "Bella Vista" } }] };
const pedir = (q: string) => GET(new Request(`http://localhost/api/geocodificar?q=${encodeURIComponent(q)}`));

describe("GET /api/geocodificar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("consulta Photon desde el servidor y devuelve las direcciones", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(photon)));
    vi.stubGlobal("fetch", fetchMock);
    const res = await pedir("Vía España");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: "osm-W7", label: "Vía España", detail: "Bella Vista", point: [-79.52, 8.99] }] });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/photon\.komoot\.io\/api\/\?q=V%C3%ADa\+Espa%C3%B1a/);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("rechaza consultas vacías o demasiado largas sin llamar a Photon", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const q of ["a", " ", "x".repeat(121)]) {
      const res = await pedir(q);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("gis.consulta_invalida");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si Photon falla responde 502 con un código propio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const res = await pedir("Obarrio");
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("gis.geocodificador_no_disponible");
  });
});
