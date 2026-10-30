import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeViaApi } from "./cliente";

describe("geocodeViaApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pide las direcciones a la ruta propia, nunca a Photon directamente", async () => {
    const items = [{ id: "osm-W7", label: "Vía España", detail: "Bella Vista", point: [-79.52, 8.99] }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocodeViaApi("Vía España")).toEqual(items);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/geocodificar?q=V%C3%ADa+Espa%C3%B1a");
  });

  it("lanza si la ruta responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "gis.geocodificador_no_disponible" }), { status: 502 })));
    await expect(geocodeViaApi("Obarrio")).rejects.toThrow("gis.geocodificador_no_disponible");
  });
});
