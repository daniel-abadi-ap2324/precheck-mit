import { beforeEach, describe, expect, it, vi } from "vitest";

const box = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const zona = (id: string, g: GeoJSON.Polygon, p: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", geometry: g, properties: { id, hoja: "5-5E", fecha_hoja: "Octubre 2025", area_m2: 1000, ...p } });

// Hoja 5-5E con tres zonas: una ZM7 con ficha, una del MIVIOT y una sin código único.
const HOJA = fc([
  zona("DGZ-5-5E-0001", box(-79.51, 9.0, -79.5, 9.01), { codigo: "1ZM7", codigos: ["1ZM7"], codigo_ficha: "ZM7", familia: "mixta", estado: "ok" }),
  zona("DGZ-5-5E-0002", box(-79.5, 9.0, -79.49, 9.01), { codigo: "MP-C2", codigos: ["MP-C2"], codigo_ficha: "MP-C2", familia: "miviot", estado: "ok" }),
  zona("DGZ-5-5E-0003", box(-79.49, 9.0, -79.48, 9.01), { codigo: null, codigos: ["1R2", "1R3"], codigo_ficha: null, familia: "conflicto", estado: "conflicto" }),
  zona("DGZ-5-5E-0004", box(-79.48, 9.0, -79.475, 9.01), { codigo: "1ZM5 / 1ZM6", codigos: ["1ZM5 / 1ZM6"], codigo_ficha: "ZM6", familia: "mixta", estado: "ok" }),
]);
const ROUTES: Record<string, unknown> = {
  "/data/base/mosaico.geojson": fc([{ type: "Feature", properties: { hoja: "5-5E", escala: "1:5.000", pdf: null }, geometry: box(-79.52, 8.99, -79.47, 9.02) }]),
  "/data/base/corregimientos.geojson": fc([{ type: "Feature", properties: { id: "080812", nombre: "Pueblo Nuevo", distrito: "Panamá", provincia: "Panamá", area_ha: 1, etiqueta: [-79.5, 9.005] }, geometry: box(-79.52, 8.99, -79.47, 9.02) }]),
  "/data/dgz/5-5E.geojson": HOJA,
  // Hoja del lote original de la demostración (PAR-081400, polígono RM-2).
  "/data/dgz/10-3B.geojson": fc([{ type: "Feature", geometry: box(-79.54, 8.99, -79.52, 9.0), properties: { id: "DGZ-10-3B-0006", codigo: "1RM-2", codigos: ["1RM-2"], codigo_ficha: "RM-2", familia: "residencial_alta", estado: "ok", hoja: "10-3B", fecha_hoja: "Octubre 2023", area_m2: 93548.6 } }]),
};

/** Lote de ~30 × 29,6 m con la esquina suroeste en (x, y). */
const lote = (x: number, y: number): [number, number][] => {
  const d = 30 / 111_320;
  return [[x, y], [x + d, y], [x + d, y + d], [x, y + d]];
};

describe("declarar un lote dibujado", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url in ROUTES ? new Response(JSON.stringify(ROUTES[url])) : new Response("", { status: 404 }))));
  });

  it("crea un lote declarado con área, corregimiento y zona del Documento Gráfico, y lo sirve como cualquier lote", async () => {
    const { mockClient } = await import("./adapter");
    const p = await mockClient.declareParcel({ puntos: lote(-79.508, 9.004), finca: "0708195", address: "Calle 17, Pueblo Nuevo" });
    expect(p).toMatchObject({ id: "DECL-0001", origen: "declarado", finca: "0708195", corregimiento: "Pueblo Nuevo", zoningCode: "ZM7" });
    // 30 m de alto × 30·cos(9°) ≈ 29,6 m de ancho (el helper no corrige la longitud por la latitud).
    expect(p.areaM2).toBeGreaterThan(880);
    expect(p.areaM2).toBeLessThan(895);
    expect(p.zoningSource).toEqual({ hoja: "5-5E", fecha: "Octubre 2025", poligono: "DGZ-5-5E-0001" });
    const prop = await mockClient.getProperty("DECL-0001");
    expect(prop.zoning?.code).toBe("ZM7");
    expect(prop.normaZona).toBe("ficha");
    expect((await mockClient.searchParcels("0708195")).map((x) => x.id)).toEqual(["DECL-0001"]);
    const capa = await mockClient.getGisLayer({ layer: "parcels" });
    expect(capa.features.find((f) => f.properties?.id === "DECL-0001")?.properties?.origen).toBe("declarado");
    const proyecto = await mockClient.createProject({ name: "P", propertyId: "", finca: "0708195", address: "x", corregimiento: "Pueblo Nuevo", projectType: "Residencial multifamiliar", applicant: "Test User", parcelId: p.id, zoningCode: p.zoningCode });
    const proyectos = await mockClient.getGisLayer({ layer: "projects" });
    expect(proyectos.features.some((f) => f.properties?.id === proyecto.id)).toBe(true);
  });

  it("no le asigna ficha del PLOT a una zona del MIVIOT ni a un polígono sin código único", async () => {
    const { mockClient } = await import("./adapter");
    const miviot = await mockClient.declareParcel({ puntos: lote(-79.498, 9.004), finca: "1", address: "x" });
    const pm = await mockClient.getProperty(miviot.id);
    expect([pm.zoning, pm.normaZona, miviot.zoningCode]).toEqual([null, "miviot", "MP-C2"]);
    const conflicto = await mockClient.declareParcel({ puntos: lote(-79.488, 9.004), finca: "2", address: "x" });
    const pc = await mockClient.getProperty(conflicto.id);
    expect([pc.zoning, pc.normaZona, conflicto.zoningCode]).toEqual([null, "revision", ""]);
  });

  it("rechaza un dibujo inválido o fuera del distrito", async () => {
    const { mockClient } = await import("./adapter");
    await expect(mockClient.declareParcel({ puntos: lote(-79.508, 9.004).slice(0, 2), finca: "1", address: "x" })).rejects.toMatchObject({ code: "lote.dibujo_invalido" });
    await expect(mockClient.declareParcel({ puntos: lote(-79.3, 9.3), finca: "1", address: "x" })).rejects.toMatchObject({ code: "lote.fuera_del_distrito" });
  });
});

describe("zona del lote declarado por área", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url in ROUTES ? new Response(JSON.stringify(ROUTES[url])) : new Response("", { status: 404 }))));
  });

  it("un lote repartido entre dos zonas no recibe la de su centroide: va a revisión con las dos y su porcentaje", async () => {
    const { mockClient } = await import("./adapter");
    // 30 × 30 m centrado en el límite ZM7 | MIVIOT (x = -79.5).
    const d = 30 / 111_320;
    const p = await mockClient.declareParcel({ puntos: [[-79.5 - d / 2, 9.004], [-79.5 + d / 2, 9.004], [-79.5 + d / 2, 9.004 + d], [-79.5 - d / 2, 9.004 + d]], finca: "1", address: "x" });
    expect([p.zoningCode, p.normaZona]).toEqual(["", "revision"]);
    expect(p.zonasLote?.map((z) => z.codigo)).toEqual(expect.arrayContaining(["1ZM7", "MP-C2"]));
    expect(p.zonasLote?.reduce((s, z) => s + z.pct, 0)).toBeCloseTo(100, 0);
    const prop = await mockClient.getProperty(p.id);
    expect([prop.zoning, prop.normaZona]).toEqual([null, "revision"]);
  });

  it("un rótulo doble (uso actual / uso futuro) va a revisión", async () => {
    const { mockClient } = await import("./adapter");
    const p = await mockClient.declareParcel({ puntos: lote(-79.4785, 9.004), finca: "1", address: "x" });
    expect(p.normaZona).toBe("revision");
    expect((await mockClient.getProperty(p.id)).zoning).toBeNull();
  });

  it("la norma queda guardada en el lote: si después la hoja no carga, no se busca ficha por código", async () => {
    const { mockClient } = await import("./adapter");
    const p = await mockClient.declareParcel({ puntos: lote(-79.508, 9.004), finca: "1", address: "x" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const prop = await mockClient.getProperty(p.id);
    expect([prop.zoning?.code, prop.normaZona]).toEqual(["ZM7", "ficha"]);
  });

  it("un lote con un vértice fuera del distrito se rechaza aunque su centroide caiga dentro", async () => {
    const { mockClient } = await import("./adapter");
    await expect(mockClient.declareParcel({ puntos: [[-79.505, 9.004], [-79.525, 9.004], [-79.525, 9.008], [-79.505, 9.008]], finca: "1", address: "x" })).rejects.toMatchObject({ code: "lote.fuera_del_distrito" });
  });
});

describe("el PreCheck se aplica al lote del proyecto", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url in ROUTES ? new Response(JSON.stringify(ROUTES[url])) : new Response("", { status: 404 }))));
  });

  it("en un lote de otra zona, las reglas RM-2 de la demostración van a revisión y el índice se recalcula", async () => {
    const { mockClient } = await import("./adapter");
    const lotePN = await mockClient.declareParcel({ puntos: lote(-79.498, 9.004), finca: "07081", address: "Calle 17, Pueblo Nuevo" });
    const proyecto = await mockClient.createProject({
      name: "Proyecto en Pueblo Nuevo", propertyId: "", finca: "07081", address: "Calle 17, Pueblo Nuevo", corregimiento: "Pueblo Nuevo",
      projectType: "Residencial multifamiliar", applicant: "Test User", parcelId: lotePN.id, zoningCode: lotePN.zoningCode,
    });
    const { precheckId } = await mockClient.startPreCheck(proyecto.id);
    const pc = await mockClient.getPreCheck(precheckId);
    const densidad = pc.results.find((r) => r.ruleId === "PLOT-RM-2-DENSIDAD");
    expect([densidad?.status, densidad?.official]).toEqual(["MANUAL_REVIEW", false]);
    expect(densidad?.explanation).toMatch(/calculado para la zona RM-2; la zona de este lote requiere revisión/);
    expect(pc.summary.manualReview).toBeGreaterThanOrEqual(38);
    expect(pc.results.filter((r) => r.status === "PASS").every((r) => !r.ruleId.startsWith("PLOT-RM-2"))).toBe(true);
  });

  it("el lote original de la demostración conserva sus resultados", async () => {
    const { mockClient } = await import("./adapter");
    const pc = await mockClient.getPreCheck("pc-betania-01");
    expect(pc.summary).toEqual({ checked: 52, passed: 38, failed: 7, warnings: 4, manualReview: 3, notApplicable: 0 });
  });

  it("el progreso de un PreCheck que no existe es un error, no «terminado»", async () => {
    const { mockClient } = await import("./adapter");
    await expect(mockClient.getPreCheckProgress("run-inventado")).rejects.toMatchObject({ code: "precheck.inexistente" });
    expect((await mockClient.getPreCheckProgress("pc-betania-01")).stage).toBe("done");
  });
});

describe("errores del adaptador", () => {
  beforeEach(() => vi.resetModules());

  it("cada operación falla con su código", async () => {
    const { mockClient } = await import("./adapter");
    await expect(mockClient.login("desconocido@correo.invalid", "clave")).rejects.toMatchObject({ code: "auth.credenciales" });
    await expect(mockClient.getProject("prj-no-existe")).rejects.toMatchObject({ code: "proyecto.inexistente" });
    await expect(mockClient.startPreCheck("prj-no-existe")).rejects.toMatchObject({ code: "proyecto.inexistente" });
    await expect(mockClient.getProperty("PAR-999999")).rejects.toMatchObject({ code: "parcela.inexistente" });
    await expect(mockClient.getPreCheck("run-no-existe")).rejects.toMatchObject({ code: "precheck.inexistente" });
  });
});

describe("ficha de un lote sin ficha cargada", () => {
  beforeEach(() => vi.resetModules());

  it("un código sin ficha cargada no toma la primera ficha de la lista", async () => {
    const { resolverFicha } = await import("./adapter");
    expect(resolverFicha({ zoningCode: "ZZ9" }, null)).toEqual({ zoning: null, normaZona: "ficha_no_cargada" });
    expect(resolverFicha({ zoningCode: "RM-2" }, null).zoning?.code).toBe("RM-2");
    // Con polígono de origen que no se pudo leer, no se busca ficha por código (un RM1 del MIVIOT no es el RM-1 del PLOT).
    expect(resolverFicha({ zoningCode: "RM1", zoningSource: { hoja: "5-5E", fecha: "x", poligono: "P" } }, null)).toEqual({ zoning: null, normaZona: "revision" });
  });
});
