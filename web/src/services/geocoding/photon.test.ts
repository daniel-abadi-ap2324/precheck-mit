import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodePhoton, parsePhoton } from "./photon";

const pt = (lng: number, lat: number, properties: Record<string, unknown>) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties });

describe("parsePhoton", () => {
  it("arma nombre, detalle y punto, y descarta duplicados y resultados sin nombre", () => {
    const json = {
      features: [
        pt(-79.52, 8.99, { osm_type: "W", osm_id: 1, name: "Vía España", district: "Bella Vista", city: "Panamá" }),
        pt(-79.52, 8.99, { osm_type: "W", osm_id: 2, name: "Vía España", district: "Bella Vista" }),
        pt(-79.51, 8.98, { osm_type: "N", osm_id: 3, street: "Calle 50", housenumber: "12", city: "Panamá" }),
        pt(-79.5, 8.97, { osm_type: "N", osm_id: 4 }),
        { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0]] }, properties: { name: "Línea" } },
      ],
    };
    expect(parsePhoton(json)).toEqual([
      { id: "osm-W1", label: "Vía España", detail: "Bella Vista", point: [-79.52, 8.99] },
      { id: "osm-N3", label: "Calle 50 12", detail: "Calle 50, Panamá", point: [-79.51, 8.98] },
    ]);
  });

  it("tolera respuestas vacías o mal formadas", () => {
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({})).toEqual([]);
  });
});

describe("geocodePhoton", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("limita la búsqueda al distrito y lanza si el servicio falla", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [pt(-79.5, 9, { name: "Obarrio" })] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocodePhoton("Obarrio")).toHaveLength(1);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("q")).toBe("Obarrio");
    expect(url.searchParams.get("bbox")).toBe("-79.705,8.897,-79.115,9.511");
    expect([url.searchParams.get("lat"), url.searchParams.get("lon")]).toEqual(["8.983", "-79.52"]);
    // Tiempo límite y agente identificable (política de uso de Photon).
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("user-agent")).toMatch(/^DOYC-PreCheck/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(geocodePhoton("Obarrio")).rejects.toThrow("503");
  });
});
