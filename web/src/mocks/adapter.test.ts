import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SHEET_10_3B: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { id: "DGZ-10-3B-0006", codigo: "1RM-2", codigos: ["1RM-2"], codigo_ficha: "RM-2", familia: "residencial_alta", estado: "ok", hoja: "10-3B", fecha_hoja: "Octubre 2023", area_m2: 93548.6 },
    },
  ],
};
const INDEX = {
  generado_desde: "Documento Gráfico de Zonificación (Anexo 6 del PLOT), DPU",
  hojas: [{ hoja: "10-3B", escala: "1:10.000", pdf: "https://dpu.mupa.gob.pa/10-3B.pdf", fecha_hoja: "Octubre 2023", bbox: [-79.59, 8.97, -79.51, 9.01], poligonos: 1, por_estado: { ok: 1, sin_etiqueta: 0, conflicto: 0 } }],
};
const DISTRICT: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", properties: { nombre: "Distrito de Panamá" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] };

const routes: Record<string, unknown> = {
  "/data/dgz/index.json": INDEX,
  "/data/dgz/10-3B.geojson": SHEET_10_3B,
  "/data/base/distrito.geojson": DISTRICT,
};

describe("mockClient · capas GIS", () => {
  const fetchMock = vi.fn(async (url: string) => (url in routes ? new Response(JSON.stringify(routes[url])) : new Response("", { status: 404 })));

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carga el índice de hojas y cada hoja una sola vez (caché en memoria)", async () => {
    const { mockClient } = await import("./adapter");
    const index = await mockClient.getZoningIndex();
    expect(index.hojas.map((h) => h.hoja)).toEqual(["10-3B"]);
    const first = await mockClient.getZoningSheet("10-3B");
    const second = await mockClient.getZoningSheet("10-3B");
    await mockClient.getZoningIndex();
    expect(second).toBe(first);
    expect(first.features.map((f) => f.properties?.id)).toEqual(["DGZ-10-3B-0006"]);
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(["/data/dgz/index.json", "/data/dgz/10-3B.geojson"]);
  });

  it("una hoja no vectorizada falla con gis.hoja_no_vectorizada y no se consulta un nombre inválido", async () => {
    const { mockClient } = await import("./adapter");
    await expect(mockClient.getZoningSheet("5-5D")).rejects.toMatchObject({ code: "gis.hoja_no_vectorizada" });
    await expect(mockClient.getZoningSheet("../secreto")).rejects.toMatchObject({ code: "gis.hoja_no_vectorizada" });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(["/data/dgz/5-5D.geojson"]);
  });

  it("si una hoja no carga, reintenta en la siguiente llamada", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    const { mockClient } = await import("./adapter");
    await expect(mockClient.getZoningSheet("10-3B")).rejects.toMatchObject({ code: "gis.hoja_no_vectorizada" });
    await expect(mockClient.getZoningSheet("10-3B")).resolves.toMatchObject({ type: "FeatureCollection" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sirve las capas base desde public/data/base con caché", async () => {
    const { mockClient } = await import("./adapter");
    const a = await mockClient.getGisLayer({ layer: "district" });
    const b = await mockClient.getGisLayer({ layer: "district" });
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/data/base/distrito.geojson");
    await expect(mockClient.getGisLayer({ layer: "rivers" })).rejects.toMatchObject({ code: "gis.capa" });
  });

  it("los lotes de demostración siguen siendo la capa de parcelas", async () => {
    const { mockClient } = await import("./adapter");
    const parcels = await mockClient.getGisLayer({ layer: "parcels" });
    expect(parcels.features).toHaveLength(43);
    expect(parcels.features.every((f) => f.properties?.zoning === "RM-2")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("la ficha del lote incluye el polígono real de la zona (desde su hoja)", async () => {
    const { mockClient } = await import("./adapter");
    const property = await mockClient.getProperty("PAR-081400");
    expect(property.zoning?.code).toBe("RM-2");
    expect(property.parcel.corregimiento).toBe("Betania");
    expect(property.zoneSource).toEqual({ hoja: "10-3B", fecha: "Octubre 2023", poligono: "DGZ-10-3B-0006", codigo: "1RM-2", estado: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("/data/dgz/10-3B.geojson");
  });
});
