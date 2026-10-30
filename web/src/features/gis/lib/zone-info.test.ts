import { describe, expect, it } from "vitest";
import type { ZonePolygon, Zoning } from "@/types";
import { fichaRows, zoneNorm, zoneRows } from "./zone-info";

const zonings: Zoning[] = [
  { code: "RM-1", name: "Residencial multifamiliar de alta densidad", norma: "PLOT", maxDensity: "1,200 pers/ha", sourcePage: 10 },
  { code: "ZM7", name: "Zona Mixta De Alta Intensidad", norma: "PLOT", sourcePage: 19 },
];

const zone = (p: Partial<ZonePolygon>): ZonePolygon => ({
  id: "DGZ-10-3B-0001",
  codigo: "1RM1",
  codigos: ["1RM1"],
  codigo_ficha: "RM1",
  familia: "residencial_alta",
  estado: "ok",
  hoja: "10-3B",
  fecha_hoja: "Octubre 2023",
  area_m2: 12345.6,
  ...p,
});

describe("zoneNorm", () => {
  it("empata el rótulo de la hoja con la ficha del PLOT (RM1 = RM-1)", () => {
    const n = zoneNorm(zone({}), zonings);
    expect(n.kind).toBe("ficha");
    if (n.kind === "ficha") expect(n.zoning.code).toBe("RM-1");
  });

  it("no usa la ficha del PLOT para un código del MIVIOT parecido", () => {
    expect(zoneNorm(zone({ codigo: "RM1", codigo_ficha: "RM1", familia: "miviot" }), zonings)).toEqual({ kind: "miviot", code: "RM1" });
  });

  it("manda a revisión los polígonos sin etiqueta o en conflicto", () => {
    expect(zoneNorm(zone({ estado: "sin_etiqueta", familia: "sin_etiqueta", codigo: null, codigos: [], codigo_ficha: null }), zonings)).toEqual({ kind: "revision" });
    expect(zoneNorm(zone({ estado: "conflicto", familia: "conflicto", codigo: null, codigos: ["1R3", "3H-R"], codigo_ficha: null }), zonings)).toEqual({ kind: "revision" });
  });

  it("distingue fichas no cargadas y el Anexo 5", () => {
    expect(zoneNorm(zone({ codigo: "1R3", codigo_ficha: "R3", familia: "residencial" }), zonings)).toEqual({ kind: "ficha_no_cargada", code: "R3" });
    expect(zoneNorm(zone({ codigo: "3H-R", codigo_ficha: "3H-R", familia: "proteccion" }), zonings)).toEqual({ kind: "anexo5", code: "3H-R" });
  });
});

describe("filas", () => {
  it("muestra la procedencia del polígono", () => {
    const rows = Object.fromEntries(zoneRows(zone({})).map((r) => [r.label, r.value]));
    expect(rows).toMatchObject({ "Código en la hoja": "1RM1", "Código de ficha": "RM1", Hoja: "10-3B · Octubre 2023", Familia: "Residencial de alta densidad" });
  });

  it("no inventa parámetros ausentes de la ficha", () => {
    expect(fichaRows(zonings[1]).every((r) => r.value === "Según ficha")).toBe(true);
  });
});
