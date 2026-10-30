import { describe, expect, it } from "vitest";
import type { Property } from "@/types";
import { buildLotInfo, sourceLine } from "./lot-info";

const parcel = { id: "DECL-0001", finca: "1", areaM2: 900, zoningCode: "MP-C2", landUse: "No declarado", centroid: [-79.5, 9] as [number, number], geometry: { type: "Polygon" as const, coordinates: [] }, district: "Panamá", corregimiento: "Pueblo Nuevo", address: "x" };

describe("ficha del lote sin ficha de zona cargada", () => {
  it("muestra el código del lote y los parámetros en revisión, nunca los de otra ficha", () => {
    const property: Property = { parcel, zoning: null, normaZona: "miviot", ceus: null };
    const rows = Object.fromEntries(buildLotInfo(property).map((r) => [r.label, r.value]));
    expect(rows["Zonificación"]).toBe("MP-C2");
    expect(rows["Altura máxima"]).toBe("Requiere revisión");
    expect(rows["Densidad máxima"]).toBe("Requiere revisión");
    expect(sourceLine(property)).toBe("Zona MP-C2 con norma del MIVIOT, no cargada: los parámetros de la zona requieren revisión.");
  });
});
