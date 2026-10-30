import { describe, expect, it } from "vitest";
import type { Property } from "@/types";
import { lotFields } from "./report-fields";
import { buildScope } from "./scope";

const base = { id: "PAR-081400", finca: "083076", areaM2: 960, zoningCode: "RM-2", landUse: "Residencial", centroid: [-79.53, 8.99] as [number, number], geometry: { type: "Polygon" as const, coordinates: [] }, district: "Panamá", corregimiento: "Betania", address: "x" };
const prop = (parcel: Property["parcel"]): Property => ({ parcel, zoning: null, normaZona: "revision", ceus: null });

describe("el informe dice de dónde viene el lote", () => {
  it("lote de demostración", () => {
    expect(lotFields(prop(base)).find((f) => f.label === "Origen del lote")?.value).toBe("Lote de demostración (no es el catastro de la ANATI)");
  });
  it("lote dibujado por el profesional, también en el alcance", () => {
    const p = prop({ ...base, id: "DECL-0001", origen: "declarado" });
    expect(lotFields(p).find((f) => f.label === "Origen del lote")?.value).toBe("Dibujado por el profesional en el mapa (no es el catastro de la ANATI)");
    const item = buildScope([], p).find((s) => s.id === "lote-declarado");
    expect(item?.body).toBe("El lote DECL-0001 lo dibujó el profesional: su forma, su área y su zona son declaradas y deben contrastarse con el catastro de la ANATI y con la CEUS, si existe.");
  });
});
