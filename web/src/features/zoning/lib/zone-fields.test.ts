import { describe, expect, it } from "vitest";
import type { Zoning } from "@/types";
import { filterZonings, normalizeZoneQuery, zoneFields } from "./zone-fields";

const rm2: Zoning = { code: "RM-2", name: "Residencial multifamiliar de alta densidad", norma: "PLOT", maxDensity: "1,500 pers/ha", setbacks: "Lo establecido ó 5m", sourcePage: 11 };
const cu: Zoning = { code: "CU", name: "Comercial urbano", norma: "PLOT", sourcePage: 23 };

describe("zoning lib", () => {
  it("quita el prefijo de clase de suelo 1", () => {
    expect(normalizeZoneQuery("1RM-2")).toBe("rm-2");
    expect(normalizeZoneQuery("RM-2")).toBe("rm-2");
    expect(filterZonings([rm2, cu], "1RM-2")).toEqual([rm2]);
    expect(filterZonings([rm2, cu], "comercial")).toEqual([cu]);
  });

  it("muestra el texto literal y marca lo que no está en la ficha", () => {
    const fields = Object.fromEntries(zoneFields(rm2).map((f) => [f.label, f.value]));
    expect(fields["Retiros"]).toBe("Lo establecido ó 5m");
    expect(fields["Densidad máxima"]).toBe("1,500 pers/ha");
    expect(fields["Frente mínimo"]).toBe("No definido en la ficha");
    expect(fields["Página de la fuente"]).toBe("pág. 11");
  });
});
